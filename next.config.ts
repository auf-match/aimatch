import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Basic-auth middleware перехватывает все запросы, а Next при наличии
  // middleware буферизует тело запроса с лимитом 10MB по умолчанию — из-за
  // чего multipart-загрузка больших аудио (Zoom-записи брифов и интервью,
  // до MAX_AUDIO_BYTES=200MB) падала на req.formData(). Поднимаем лимит.
  experimental: {
    middlewareClientMaxBodySize: "210mb",
  },
};

export default nextConfig;
