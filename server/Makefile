.PHONY: build build-real build-hwsim run run-mock selfcheck hwsim test test-race cover vet fmt tidy smoke-real test-real-matrix clean

# 发布构建：只产出 authd，禁止包含 hwsim（tasks 9.2）。
build: build-real

build-real:
	go build -o bin/authd ./cmd/authd

# 模拟器独立 target，产物不得进入发布目录。
build-hwsim:
	go build -o bin/hwsim ./cmd/hwsim

run:
	go run ./cmd/authd

run-mock:
	AUTH_MODE=mock AUTH_ALLOW_MOCK=1 ENV=development \
	HWSIM_BASE_URL=http://127.0.0.1:8081 AUTH_STORAGE_NAMESPACE=real-mock \
	DATABASE_DSN=./data/auth-mock.json go run ./cmd/authd

selfcheck:
	go run ./cmd/authd --selfcheck

hwsim:
	go run ./cmd/hwsim --addr :8081 --scenario success

test:
	go test ./...

test-race:
	go test ./... -race

test-real-matrix:
	go test ./... -run 'TestSelfCheck|TestMatchesOfficial|TestOpenWithOptions|TestLogin' -v

smoke-real:
	node ../scripts/smoke-real.mjs

cover:
	go test ./... -coverprofile=coverage.out
	go tool cover -func=coverage.out

vet:
	go vet ./...

fmt:
	gofmt -l -w .

tidy:
	go mod tidy

clean:
	rm -rf data coverage.out