import { Routes, Route, Navigate } from "react-router-dom";
import { PublicLayout } from "./components/layout/PublicLayout";
import { LandingPage } from "./features/landing/LandingPage";
import { InquiryWizard } from "./features/inquiry/InquiryWizard";
import { StatusTracker } from "./features/status/StatusTracker";

export default function App() {
  return (
    <PublicLayout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/inquiry" element={<InquiryWizard />} />
        <Route path="/status" element={<StatusTracker />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PublicLayout>
  );
}
