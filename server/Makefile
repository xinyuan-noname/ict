.PHONY: build run run-dev test test-race cover vet fmt hwsim tidy clean

build:
	go build ./...

run:
	go run ./cmd/authd

run-dev:
	ENV=development DATABASE_DSN=./data/auth.json go run ./cmd/authd

hwsim:
	go run ./cmd/hwsim --addr :8081 --scenario success

test:
	go test ./...

test-race:
	go test ./... -race

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