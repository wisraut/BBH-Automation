# ใช้ Node.js เวอร์ชันล่าสุดเป็นฐาน
FROM node:20-alpine AS build

WORKDIR /app

# ก๊อปปี้ไฟล์ package.json เพื่อลง library
COPY package*.json ./
RUN npm install

# ก๊อปปี้โค้ดทั้งหมดเข้ามา
COPY . .

# สั่ง build โปรเจกต์ Vite
RUN npm run build

# ใช้ Nginx ในการรันหน้าเว็บในขั้นตอนสุดท้าย
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# เปิดพอร์ต 80 (พอร์ตมาตรฐานของเว็บ)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]