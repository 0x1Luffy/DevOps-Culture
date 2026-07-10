# ---------- Base Image ----------
FROM node:26-alpine3.22

# ---------- Create App Directory ----------
WORKDIR /app

# ---------- Copy Dependency Files First ----------
COPY package*.json ./

# ---------- Install Only Production Dependencies ----------
RUN npm install --omit=dev

# ---------- Copy Remaining Files ----------
COPY . .

# ---------- Create Non-Root User ----------
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# ---------- Change Ownership ----------
RUN chown -R appuser:appgroup /app

# ---------- Switch User ----------
USER appuser

# ---------- Expose Port ----------
EXPOSE 5001

# ---------- Start Application ----------
CMD ["node", "server.js"]
