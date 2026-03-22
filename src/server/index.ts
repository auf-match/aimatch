import express from "express";
import dotenv from "dotenv";
import uploadRouter from "./routes/upload";
import candidatesRouter from "./routes/candidates";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(uploadRouter);
app.use(candidatesRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
