// hwsim 是华为账号服务的本地模拟器（任务 14）。
// 仅用于开发/测试，禁止进入发布产物。
package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	addr       = flag.String("addr", ":8081", "listen address")
	scenario   = flag.String("scenario", "success", "default scenario")
	delay      = flag.Duration("delay", 5*time.Second, "delay for timeout scenario")
	key        *rsa.PrivateKey
	kid        = "hwsim-key-1"
	calls      sync.Map
	usedCodes  sync.Map
	tokenStore sync.Map
)

func main() {
	flag.Parse()
	var err error
	key, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /oauth2/v3/token", handleToken)
	mux.HandleFunc("POST /oauth2/v3/tokeninfo", handleTokeninfo)
	mux.HandleFunc("GET /oauth2/v3/certs", handleCerts)
	mux.HandleFunc("GET /hwsim/stats", handleStats)
	log.Printf("hwsim listening on %s scenario=%s", *addr, *scenario)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

func currentScenario(r *http.Request) string {
	if s := r.Header.Get("X-Hwsim-Scenario"); s != "" {
		return s
	}
	return *scenario
}

func bump(endpoint string) {
	v, _ := calls.LoadOrStore(endpoint, new(atomic.Int64))
	v.(*atomic.Int64).Add(1)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func handleToken(w http.ResponseWriter, r *http.Request) {
	bump("token")
	sc := currentScenario(r)
	if sc == "timeout" {
		time.Sleep(*delay)
	}
	switch sc {
	case "server_error":
		writeJSON(w, 500, map[string]any{"error": "server_error"})
		return
	case "rate_limited":
		writeJSON(w, 429, map[string]any{"error": "too_many_requests"})
		return
	case "invalid_client":
		writeJSON(w, 200, map[string]any{"error": "invalid_client", "error_description": "bad secret"})
		return
	}
	if err := r.ParseForm(); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid_request"})
		return
	}
	code := r.PostFormValue("code")
	if code == "" {
		writeJSON(w, 400, map[string]any{"error": "invalid_grant"})
		return
	}
	if _, used := usedCodes.LoadOrStore(code, true); used {
		writeJSON(w, 200, map[string]any{"error": "invalid_grant", "error_description": "code already used"})
		return
	}
	if sc == "invalid_grant" {
		writeJSON(w, 200, map[string]any{"error": "invalid_grant"})
		return
	}

	openID := "openid_" + code
	if sc == "missing_openid" {
		openID = ""
	}
	name, avatar := "华小为", "https://example.com/avatar.png"
	if sc == "no_profile" {
		name, avatar = "", ""
	}
	if sc == "http_avatar" {
		avatar = "http://insecure.example.com/a.png"
	}
	idToken := signIDToken(openID, name, avatar, sc == "bad_signature")
	accessToken := "at_" + base64.RawURLEncoding.EncodeToString([]byte(openID))
	tokenStore.Store(accessToken, map[string]string{"openid": openID, "name": name, "avatar": avatar})
	writeJSON(w, 200, map[string]any{
		"access_token": accessToken,
		"id_token":     idToken,
		"expires_in":   3600,
	})
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func signIDToken(openID, name, avatar string, badSig bool) string {
	header := map[string]any{"alg": "RS256", "typ": "JWT", "kid": kid}
	claims := map[string]any{
		"iss": "https://accounts.huawei.com", "aud": "hwsim-client", "sub": openID,
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
		"unionid": "union_" + openID, "display_name": name, "picture": avatar,
	}
	hb, _ := json.Marshal(header)
	pb, _ := json.Marshal(claims)
	signingInput := b64(hb) + "." + b64(pb)
	hash := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		sig = []byte("garbage")
	}
	if badSig {
		sig = []byte("bad-signature")
	}
	return signingInput + "." + b64(sig)
}

func handleTokeninfo(w http.ResponseWriter, r *http.Request) {
	bump("tokeninfo")
	if err := r.ParseForm(); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid_request"})
		return
	}
	at := r.PostFormValue("access_token")
	v, ok := tokenStore.Load(at)
	if !ok {
		writeJSON(w, 200, map[string]any{"error": "invalid_token"})
		return
	}
	info := v.(map[string]string)
	writeJSON(w, 200, map[string]any{
		"openid": info["openid"], "unionid": "union_" + info["openid"],
		"display_name": info["name"], "picture": info["avatar"], "client_id": "hwsim-client",
	})
}

func handleCerts(w http.ResponseWriter, r *http.Request) {
	bump("certs")
	pub := key.PublicKey
	writeJSON(w, 200, map[string]any{"keys": []map[string]any{{
		"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256",
		"n": b64(pub.N.Bytes()),
		"e": b64(big.NewInt(int64(pub.E)).Bytes()),
	}}})
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	out := map[string]int64{}
	calls.Range(func(k, v any) bool {
		out[k.(string)] = v.(*atomic.Int64).Load()
		return true
	})
	writeJSON(w, 200, out)
}

var _ = strings.TrimSpace
var _ = fmt.Sprintf