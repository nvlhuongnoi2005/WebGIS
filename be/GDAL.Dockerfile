FROM golang:1.25-bookworm AS build

WORKDIR /src/be
COPY be/go.mod be/go.sum ./
RUN go mod download
COPY be ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/controller .

# The worker uses the same controller binary in its gdal-worker mode, but this
# image supplies ogrinfo/ogr2ogr and the MVT/MBTiles drivers.
FROM ghcr.io/osgeo/gdal:ubuntu-small-latest
COPY --from=build /out/controller /controller
COPY --from=build /src/be/migrations /migrations
WORKDIR /tmp
USER 65532:65532
ENTRYPOINT ["/controller"]
