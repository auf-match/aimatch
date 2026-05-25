// src/app/candidates/upload/bulk/page.tsx
// Permanent redirect — bulk upload is now part of /candidates/upload
import { redirect } from "next/navigation";

export default function BulkUploadRedirect() {
  redirect("/candidates/upload");
}
