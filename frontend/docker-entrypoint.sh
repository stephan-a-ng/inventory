#!/bin/sh
# Substitute BACKEND_URL in nginx config at startup
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
