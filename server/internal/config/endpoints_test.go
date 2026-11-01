package config

import "testing"

func TestMatchesOfficial(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{OfficialTokenURL, true},
		{"https://oauth-login.cloud.huawei.com/oauth2/v3/certs", false},
		{"https://oauth-login.cloud.huawei.com.evil.tld/oauth2/v3/token", false},
		{"https://oauth-login.cloud.huawei.com/oauth2/v3/token/", false},
		{"https://oauth-login.cloud.huawei.com/oauth2/v3/token?x=1", false},
		{"https://oauth-login.cloud.huawei.com/oauth2/v3/token#frag", false},
		{"http://oauth-login.cloud.huawei.com/oauth2/v3/token", false},
		{"https://oauth-login.cloud.huawei.com:8443/oauth2/v3/token", false},
		{"https://127.0.0.1/oauth2/v3/token", false},
		{"https://mirror.example.com/oauth2/v3/token", false},
		{"https://oauth-login.cloud.huawei.com/oauth2/v3/token/extra", false},
		{"", false},
	}
	for _, c := range cases {
		if got := MatchesOfficial(c.value, OfficialTokenURL); got != c.want {
			t.Errorf("MatchesOfficial(%q) = %v, want %v", c.value, got, c.want)
		}
	}
}

func TestParseExactURLRejectsUnsafe(t *testing.T) {
	bad := []string{
		"http://oauth-login.cloud.huawei.com/oauth2/v3/token",
		"https://127.0.0.1/oauth2/v3/token",
		"https://localhost/oauth2/v3/token",
		"https://oauth-login.cloud.huawei.com:8080/oauth2/v3/token",
		"https://oauth-login.cloud.huawei.com/",
		"https://oauth-login.cloud.huawei.com/oauth2/v3/token?a=1",
	}
	for _, v := range bad {
		if _, ok := ParseExactURL(v); ok {
			t.Errorf("ParseExactURL(%q) should fail", v)
		}
	}
	if _, ok := ParseExactURL(OfficialJWKSURL); !ok {
		t.Fatal("official jwks url should parse")
	}
}

func TestIsLoopbackEndpoint(t *testing.T) {
	ok := []string{"http://127.0.0.1:8081", "http://localhost:18081"}
	for _, v := range ok {
		if !IsLoopbackEndpoint(v) {
			t.Errorf("%q should be loopback", v)
		}
	}
	bad := []string{"https://127.0.0.1:8081", "http://127.0.0.1", "http://evil.example.com:8081", "http://10.0.0.1:8081"}
	for _, v := range bad {
		if IsLoopbackEndpoint(v) {
			t.Errorf("%q should not be loopback", v)
		}
	}
}

func TestValidateEndpointsFailsOnCustomDomain(t *testing.T) {
	c := &Config{
		HuaweiTokenURL:     "https://huawei.com.evil.tld/oauth2/v3/token",
		HuaweiJWKSURL:      OfficialJWKSURL,
		HuaweiTokeninfoURL: OfficialTokeninfoURL,
		HuaweiAuthorizeURL: OfficialAuthorizeURL,
	}
	problems := c.ValidateEndpoints()
	if len(problems) != 1 || problems[0] != "endpoint token not official" {
		t.Fatalf("unexpected problems: %v", problems)
	}
}