package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"ict/server/internal/middleware"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

const weChatBindCookie = "ict_wx_bind"

type wechatCallbackRequest struct {
	Code          string `json:"code"`
	State         string `json:"state"`
	Cancelled     bool   `json:"cancelled"`
	ClientVersion string `json:"clientVersion"`
}

func (s *Server) wechatAvailability(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	w.Header().Set("Cache-Control", "no-store")
	if s.WeChat == nil {
		writeJSON(w, tid, http.StatusOK, map[string]any{"enabled": false, "reason": "disabled", "traceId": tid})
		return
	}
	view := s.WeChat.Availability()
	body := map[string]any{"enabled": view.Enabled, "traceId": tid}
	if view.Reason != "" {
		body["reason"] = view.Reason
	}
	writeJSON(w, tid, http.StatusOK, body)
}

func (s *Server) wechatAuthorize(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	if s.WeChat == nil {
		apperr.Write(w, apperr.Auth008, tid, 0)
		return
	}
	ip := middleware.ClientIP(r, s.Cfg.TrustedProxies)
	view, err := s.WeChat.Authorize(r.Context(), ip)
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, 0)
		return
	}
	secure := s.Cfg.Env == "production"
	cookie := &http.Cookie{
		Name:     weChatBindCookie,
		Value:    view.BindHandle,
		Path:     "/v1/auth/wechat",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	}
	http.SetCookie(w, cookie)
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"authorizeUrl": view.AuthorizeURL,
		"callbackPath": view.CallbackPath,
		"expiresAt":    view.ExpiresAt,
		"traceId":      tid,
	})
}

func (s *Server) wechatCallback(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	if s.WeChat == nil {
		apperr.Write(w, apperr.Auth008, tid, 0)
		return
	}
	if r.Method != http.MethodPost {
		apperr.Write(w, apperr.Auth006, tid, 0)
		return
	}
	var req wechatCallbackRequest
	if r.Body == nil {
		apperr.Write(w, apperr.Auth006, tid, 0)
		return
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 8*1024))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil && err.Error() != "EOF" {
		apperr.Write(w, apperr.Auth006, tid, 0)
		return
	}
	bindHandle := ""
	if cookie, err := r.Cookie(weChatBindCookie); err == nil {
		bindHandle = cookie.Value
	}
	view, err := s.WeChat.Callback(r.Context(), service.WeChatCallbackInput{
		Code: req.Code, State: req.State, BindHandle: bindHandle,
		ClientVersion: req.ClientVersion,
		RemoteIP:      middleware.ClientIP(r, s.Cfg.TrustedProxies),
		Cancelled:     req.Cancelled,
	})
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, 0)
		return
	}
	if view.Cancelled {
		writeJSON(w, tid, http.StatusOK, map[string]any{"cancelled": true, "traceId": tid})
		return
	}
	user := map[string]any{
		"userId": view.User.UserID, "displayName": view.User.DisplayName,
		"avatarUrl": view.User.AvatarURL,
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"sessionToken": view.SessionToken,
		"expiresAt":    view.ExpiresAt,
		"user":         user,
		"firstLogin":   view.FirstLogin,
		"platform":     view.Platform,
		"traceId":      tid,
	})
}