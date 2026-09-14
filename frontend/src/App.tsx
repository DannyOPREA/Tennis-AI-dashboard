import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ListSkeleton } from "@/components/common/states";
import { AppShell } from "@/components/shell/AppShell";
import { SetupProvider } from "@/lib/setup";
import { BatchesPage } from "@/pages/BatchesPage";
import { ComparePage } from "@/pages/ComparePage";
import { LibraryPage } from "@/pages/LibraryPage";
import { NewRunPage } from "@/pages/NewRunPage";
import { PromptsPage } from "@/pages/PromptsPage";
import { RunDetailPage } from "@/pages/RunDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WelcomePage } from "@/pages/WelcomePage";

// Dashboard pulls in recharts; keep it out of the initial bundle.
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));

export default function App() {
	return (
		<SetupProvider>
			<Routes>
				<Route element={<AppShell />}>
					<Route index element={<LibraryPage />} />
					<Route path="runs/new" element={<NewRunPage />} />
					<Route path="runs/:id" element={<RunDetailPage />} />
					<Route path="batches" element={<BatchesPage />} />
					<Route path="batches/:id" element={<ComparePage />} />
					<Route
						path="dashboard"
						element={
							<Suspense fallback={<ListSkeleton rows={6} />}>
								<DashboardPage />
							</Suspense>
						}
					/>
					<Route path="prompts" element={<PromptsPage />} />
					<Route path="settings" element={<SettingsPage />} />
					<Route path="welcome" element={<WelcomePage />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</SetupProvider>
	);
}
