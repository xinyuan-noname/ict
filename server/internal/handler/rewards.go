package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/middleware"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

// requireUser 复用既有会话校验（Bearer），续期时回传 X-Session-Token。
func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (domain.UserProfile, bool) {
	tid := logx.TraceID(r.Context())
	raw, ok := middleware.BearerToken(r)
	if !ok {
		apperr.Write(w, apperr.Auth004, tid, 0)
		return domain.UserProfile{}, false
	}
	ip := middleware.ClientIP(r, s.Cfg.TrustedProxies)
	_, profile, renewed, _, err := s.Auth.Authenticate(r.Context(), raw, ip)
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, service.RetryAfter(err))
		return domain.UserProfile{}, false
	}
	if renewed != "" {
		w.Header().Set("X-Session-Token", renewed)
	}
	return profile, true
}

func (s *Server) rewardStatus(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	view, err := s.Reward.Status(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), logx.TraceID(r.Context()), 0)
		return
	}
	writeJSON(w, logx.TraceID(r.Context()), http.StatusOK, map[string]any{
		"today": view.Today, "timezone": view.Timezone,
		"canCheckIn": view.CanCheckIn, "checkedIn": view.CheckedIn,
		"streakDays": view.StreakDays, "todayReward": view.TodayReward, "nextReward": view.NextReward,
		"pointsBalance": view.PointsBalance,
		"lastCheckInDate": nullable(view.LastCheckInDate),
		"serverTime":      view.ServerTime,
		"traceId":         logx.TraceID(r.Context()),
	})
}

func (s *Server) rewardCheckIn(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Body != nil {
		var probe map[string]any
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		if err := dec.Decode(&probe); err == nil {
			if _, has := probe["userId"]; has {
				apperr.WriteReward(w, apperr.Point001, logx.TraceID(r.Context()), 0)
				return
			}
		}
	}
	view, err := s.Reward.CheckIn(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), logx.TraceID(r.Context()), 0)
		return
	}
	writeJSON(w, logx.TraceID(r.Context()), http.StatusOK, map[string]any{
		"checkedIn": view.CheckedIn, "alreadyCheckedIn": view.AlreadyCheckedIn,
		"checkInDate": view.CheckInDate, "streakDays": view.StreakDays,
		"earnedPoints": view.EarnedPoints, "balanceAfter": view.BalanceAfter,
		"balanceCapped": view.BalanceCapped, "nextReward": view.NextReward,
		"ruleVersion": view.RuleVersion, "traceId": logx.TraceID(r.Context()),
	})
}

func (s *Server) rewardLedger(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	cursor := r.URL.Query().Get("cursor")
	if len(cursor) > 256 {
		apperr.WriteReward(w, apperr.Point001, logx.TraceID(r.Context()), 0)
		return
	}
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 50 {
			apperr.WriteReward(w, apperr.Point001, logx.TraceID(r.Context()), 0)
			return
		}
		limit = n
	}
	view, err := s.Reward.Ledger(r.Context(), profile.UserID, cursor, limit)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), logx.TraceID(r.Context()), 0)
		return
	}
	items := make([]map[string]any, 0, len(view.Items))
	for _, it := range view.Items {
		item := map[string]any{
			"entryId": it.EntryID, "type": it.Type, "amount": it.Amount,
			"balanceAfter": it.BalanceAfter, "occurredAt": it.OccurredAt, "ruleVersion": it.RuleVersion,
		}
		if it.RefID != "" {
			item["refId"] = it.RefID
		}
		if it.FrameID != "" {
			item["frameId"] = it.FrameID
		}
		items = append(items, item)
	}
	body := map[string]any{
		"items": items, "hasMore": view.HasMore, "traceId": logx.TraceID(r.Context()),
	}
	if view.NextCursor != "" {
		body["nextCursor"] = view.NextCursor
	} else {
		body["nextCursor"] = nil
	}
	writeJSON(w, logx.TraceID(r.Context()), http.StatusOK, body)
}

func (s *Server) rewardFrames(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "on_sale"
	}
	view, err := s.Reward.Frames(r.Context(), profile.UserID, status)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), logx.TraceID(r.Context()), 0)
		return
	}
	frames := make([]map[string]any, 0, len(view.Frames))
	for _, f := range view.Frames {
		frames = append(frames, map[string]any{
			"frameId": f.FrameID, "name": f.Name, "description": f.Description,
			"price": f.Price, "status": f.Status, "assetUrl": f.AssetURL,
			"pixelSpec": map[string]any{"canvas": domain.FrameCanvas, "grid": domain.FrameGrid, "paletteMax": domain.FramePaletteMax},
			"owned":     f.Owned, "equipped": f.Equipped, "purchasable": f.Purchasable,
		})
	}
	writeJSON(w, logx.TraceID(r.Context()), http.StatusOK, map[string]any{
		"catalogVersion": view.CatalogVersion, "frames": frames, "traceId": logx.TraceID(r.Context()),
	})
}

type redeemRequest struct {
	CatalogVersion string `json:"catalogVersion"`
	ClientRequestID string `json:"clientRequestId"`
}

func (s *Server) rewardRedeem(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	frameID := r.PathValue("frameId")
	tid := logx.TraceID(r.Context())
	idemKey := r.Header.Get("Idempotency-Key")
	if !domain.ValidIdempotencyKey(idemKey) {
		apperr.WriteReward(w, apperr.Reward008, tid, 0)
		return
	}
	var req redeemRequest
	if r.Body != nil {
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil && err.Error() != "EOF" {
			apperr.WriteReward(w, apperr.Reward008, tid, 0)
			return
		}
	}
	if req.CatalogVersion == "" {
		apperr.WriteReward(w, apperr.Reward008, tid, 0)
		return
	}
	view, err := s.Reward.Redeem(r.Context(), profile.UserID, frameID, idemKey, req.CatalogVersion)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"orderId": view.OrderID, "frameId": view.FrameID, "price": view.Price,
		"balanceAfter": view.BalanceAfter, "redeemedAt": view.RedeemedAt,
		"replayed": view.Replayed, "owned": view.Owned, "equipped": view.Equipped, "traceId": tid,
	})
}

type equipRequest struct {
	FrameID         *string `json:"frameId"`
	ClientRequestID string  `json:"clientRequestId"`
}

func (s *Server) rewardEquip(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var req equipRequest
	if err := decodeStrict(r, &req); err != nil {
		apperr.WriteReward(w, apperr.Reward008, tid, 0)
		return
	}
	view, err := s.Reward.Equip(r.Context(), profile.UserID, req.FrameID)
	if err != nil {
		apperr.WriteReward(w, apperr.NormalizeReward(err), tid, 0)
		return
	}
	var frame any
	if view.EquippedFrame != nil {
		frame = map[string]any{
			"frameId": view.EquippedFrame.FrameID, "name": view.EquippedFrame.Name,
			"assetUrl": view.EquippedFrame.AssetURL,
		}
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"equippedFrame": frame, "changed": view.Changed, "traceId": tid,
	})
}

func decodeStrict(r *http.Request, dst any) error {
	if r.Body == nil {
		return nil
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 4096))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func nullable(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

var _ = time.Now