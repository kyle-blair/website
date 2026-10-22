FROM alpine:3.24
CMD ["chown", "-R", "10001:10001", "/var/data"]
