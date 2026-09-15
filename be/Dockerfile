FROM golang:1.25-bookworm AS build

WORKDIR /src/be

COPY be/go.mod be/go.sum ./
RUN go mod download

COPY be ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/controller .

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/controller /controller
COPY --from=build /src/be/migrations /migrations

EXPOSE 3001

USER nonroot:nonroot
ENTRYPOINT ["/controller"]
