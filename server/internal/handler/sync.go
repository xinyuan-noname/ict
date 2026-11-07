package handler

import (
	"net/http"
	"strconv"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

type syncChangeRequest struct {
	ChangeID  string                 `json:"changeId"`
	Entity    string                 `json:"entity"`
	Op        string                 `json:"op"`
	Record    *addSportRecordRequest `json:"record"`
	RecordID  string                 `json:"recordId"`
	DeletedAt string                 `json:"deletedAt"`
}

type syncPushRequest struct {
	BatchID    string              `json:"batchId"`
	BaseCursor string              `json:"baseCursor"`
	Changes    []syncChangeRequest `json:"changes"`
}

type reconcileRequest struct {
	Local struct {
		SportRecordCount    int      `json:"sportRecordCount"`
		SportRecordIDs      []string `json:"sportRecordIds"`
		CachedBalance       *int     `json:"cachedBalance"`
		CachedUnlockedCount int      `json:"cachedUnlockedCount"`
	} `json:"local"`
}

func sportRecordJSON(record domain.SportRecord) map[string]any {
	return map[string]any{
		"recordId": record.RecordID, "type": string(record.Type), "day": record.Day,
		"distanceM": record.DistanceM, "durationS": record.DurationS, "steps": record.Steps,
		"continuous": record.Continuous, "seq": record.Seq,
		"createdAt": record.CreatedAt.In(domain.BusinessZone).Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (s *Server) syncCursor(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Sync.Cursor(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"cursor": view.Cursor, "serverTime": view.ServerTime,
		"scopeVersion": view.ScopeVersion, "traceId": tid,
	})
}

func (s *Server) syncSnapshot(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	cursor := r.URL.Query().Get("cursor")
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > service.SyncSnapshotLimitMax {
			apperr.WriteSport(w, apperr.Sport001, tid, 0)
			return
		}
		limit = n
	}
	view, err := s.Sync.Snapshot(r.Context(), profile.UserID, cursor, limit)
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	records := make([]map[string]any, 0, len(view.Records))
	for _, record := range view.Records {
		records = append(records, sportRecordJSON(record))
	}
	tombs := make([]map[string]any, 0, len(view.Tombstones))
	for _, t := range view.Tombstones {
		tombs = append(tombs, map[string]any{
			"entity": t.Entity, "recordId": t.BusinessKey,
			"deletedAt": t.DeletedAt.In(domain.BusinessZone).Format("2006-01-02T15:04:05Z07:00"),
			"seq": t.Seq,
		})
	}
	achievements := make([]map[string]any, 0, len(view.Achievements))
	for _, item := range view.Achievements {
		achievements = append(achievements, achievementJSON(item))
	}
	entries := make([]map[string]any, 0, len(view.Entries))
	for _, it := range view.Entries {
		entry := map[string]any{
			"entryId": it.EntryID, "type": it.Type, "amount": it.Amount,
			"balanceAfter": it.BalanceAfter, "occurredAt": it.OccurredAt, "ruleVersion": it.RuleVersion,
		}
		if it.RefID != "" {
			entry["refId"] = it.RefID
		}
		entries = append(entries, entry)
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"cursor": view.Cursor, "hasMore": view.HasMore,
		"sportRecords": records, "tombstones": tombs,
		"achievements": achievements,
		"points": map[string]any{"balance": view.PointsBalance, "entries": entries},
		"traceId": tid,
	})
}

func (s *Server) syncPush(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var req syncPushRequest
	if err := decodeSyncBody(r, &req); err != nil {
		apperr.WriteSport(w, apperr.Sport001, tid, 0)
		return
	}
	changes := make([]service.SyncChange, 0, len(req.Changes))
	for _, c := range req.Changes {
		change := service.SyncChange{
			ChangeID: c.ChangeID, Entity: c.Entity, Op: c.Op,
			RecordID: c.RecordID, DeletedAt: c.DeletedAt,
		}
		if c.Record != nil {
			change.Record = &service.AddRecordInput{
				RecordID: c.Record.RecordID, Type: c.Record.Type, Day: c.Record.Day,
				DistanceM: c.Record.DistanceM, DurationS: c.Record.DurationS,
				Steps: c.Record.Steps, Continuous: c.Record.Continuous, ClientSeq: c.Record.ClientSeq,
			}
		}
		changes = append(changes, change)
	}
	view, err := s.Sync.Push(r.Context(), profile.UserID, req.BatchID, req.BaseCursor, changes)
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	results := make([]map[string]any, 0, len(view.Results))
	for _, item := range view.Results {
		result := map[string]any{"changeId": item.ChangeID, "status": item.Status}
		if item.Code != "" {
			result["code"] = item.Code
		}
		if item.RecordID != "" {
			result["recordId"] = item.RecordID
		}
		results = append(results, result)
	}
	retryable := view.Retryable
	if retryable == nil {
		retryable = []string{}
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"batchId": req.BatchID, "results": results, "retryable": retryable,
		"cursor": view.Cursor, "hasMore": view.HasMore, "traceId": tid,
	})
}

func (s *Server) syncReconcile(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var req reconcileRequest
	if err := decodeSyncBody(r, &req); err != nil {
		apperr.WriteSport(w, apperr.Sport001, tid, 0)
		return
	}
	view, err := s.Sync.Reconcile(r.Context(), profile.UserID, service.ReconcileLocal{
		SportRecordCount: req.Local.SportRecordCount, SportRecordIDs: req.Local.SportRecordIDs,
		CachedBalance: req.Local.CachedBalance, CachedUnlockedCount: req.Local.CachedUnlockedCount,
	})
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	diffs := make([]map[string]any, 0, len(view.Diffs))
	for _, d := range view.Diffs {
		item := map[string]any{"kind": d.Kind, "action": d.Action}
		if d.BusinessKey != "" {
			item["businessKey"] = d.BusinessKey
		}
		if d.Local != nil {
			item["local"] = d.Local
		}
		if d.Server != nil {
			item["server"] = d.Server
		}
		diffs = append(diffs, item)
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"consistent": view.Consistent, "diffs": diffs, "cursor": view.Cursor, "traceId": tid,
	})
}

func decodeSyncBody(r *http.Request, dst any) error {
	return decodeSportBody(r, dst)
}