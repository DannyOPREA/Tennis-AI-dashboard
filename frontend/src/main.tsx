import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { ToastProvider } from "@/components/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EventsProvider } from "@/lib/events";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
	<StrictMode>
		<BrowserRouter>
			<TooltipProvider>
				<ToastProvider>
					<EventsProvider>
						<App />
					</EventsProvider>
				</ToastProvider>
			</TooltipProvider>
		</BrowserRouter>
	</StrictMode>,
);
