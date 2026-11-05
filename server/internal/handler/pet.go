package handler

import (
	"net/http"

	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

type adoptBody struct {
	Species string `json:"species"`
	Name    string `json:"name"`
}

func (s *Server) petGet(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	pet, err := s.Pet.GetPet(r.Context(), profile.UserID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"pet": pet, "traceId": tid})
}

func (s *Server) petAdopt(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body adoptBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WritePet(w, apperr.Pet001, tid, 0)
		return
	}
	pet, err := s.Pet.Adopt(r.Context(), profile.UserID, body.Species, body.Name)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"pet": pet, "traceId": tid})
}

type petPatchBody struct {
	Name  string `json:"name"`
	Alloc string `json:"allocate"`
}

func (s *Server) petPatch(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body petPatchBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WritePet(w, apperr.Pet001, tid, 0)
		return
	}
	var pet any
	var err error
	if body.Alloc != "" {
		pet, err = s.Pet.Allocate(r.Context(), profile.UserID, body.Alloc)
	} else {
		pet, err = s.Pet.Rename(r.Context(), profile.UserID, body.Name)
	}
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"pet": pet, "traceId": tid})
}

type useBody struct {
	IdempotencyKey string `json:"idempotencyKey"`
}

func (s *Server) petFeed(w http.ResponseWriter, r *http.Request) {
	s.petUseItem(w, r, "food")
}

func (s *Server) petPlay(w http.ResponseWriter, r *http.Request) {
	s.petUseItem(w, r, "toy")
}

func (s *Server) petUseItem(w http.ResponseWriter, r *http.Request, kind string) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	itemID := r.URL.Query().Get("itemId")
	idem := r.Header.Get("Idempotency-Key")
	pet, err := s.Pet.UseItem(r.Context(), profile.UserID, itemID, idem, kind)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"pet": pet, "traceId": tid})
}

func (s *Server) itemList(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	items, err := s.Pet.Items(r.Context(), profile.UserID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"items": items, "traceId": tid})
}

func (s *Server) itemRedeem(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	qty, err := s.Pet.Redeem(r.Context(), profile.UserID, r.PathValue("itemId"), r.Header.Get("Idempotency-Key"))
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"qty": qty, "traceId": tid})
}

func (s *Server) itemUse(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	pet, err := s.Pet.UseItem(r.Context(), profile.UserID, r.PathValue("itemId"), r.Header.Get("Idempotency-Key"), "")
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"pet": pet, "traceId": tid})
}

func (s *Server) friendList(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	friends, err := s.Pet.Friends(r.Context(), profile.UserID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"friends": friends, "traceId": tid})
}

func (s *Server) friendInvite(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	invite, err := s.Pet.CreateInvite(r.Context(), profile.UserID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"code": invite.Code, "expiresAt": invite.ExpiresAt, "traceId": tid})
}

type acceptBody struct {
	Code string `json:"code"`
}

func (s *Server) friendAccept(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body acceptBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WritePet(w, apperr.Friend001, tid, 0)
		return
	}
	if err := s.Pet.AcceptInvite(r.Context(), profile.UserID, body.Code); err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"accepted": true, "traceId": tid})
}

func (s *Server) friendDelete(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if err := s.Pet.RemoveFriend(r.Context(), profile.UserID, r.PathValue("friendId")); err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"deleted": true, "traceId": tid})
}

func (s *Server) friendBlock(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if err := s.Pet.BlockFriend(r.Context(), profile.UserID, r.PathValue("friendId")); err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"blocked": true, "traceId": tid})
}

type challengeBody struct {
	FriendID string `json:"friendId"`
}

func (s *Server) pkChallenge(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body challengeBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WritePet(w, apperr.Pk001, tid, 0)
		return
	}
	match, err := s.Pet.Challenge(r.Context(), profile.UserID, body.FriendID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"match": match, "traceId": tid})
}

func (s *Server) pkAccept(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	match, err := s.Pet.AcceptPK(r.Context(), profile.UserID, r.PathValue("pkId"))
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"match": match, "traceId": tid})
}

func (s *Server) pkGet(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	match, err := s.Pet.GetPK(r.Context(), profile.UserID, r.PathValue("pkId"))
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"match": match, "traceId": tid})
}

func (s *Server) pkHistory(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	history, err := s.Pet.PKHistory(r.Context(), profile.UserID)
	if err != nil {
		apperr.WritePet(w, apperr.NormalizePet(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"matches": history, "traceId": tid})
}