import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { SetupStatus } from "@/api/types";
import { useAsync } from "@/lib/hooks";

export const SETUP_SKIP_KEY = "tennisai.setupSkipped";

function readSkipped(): boolean {
	try {
		return window.localStorage.getItem(SETUP_SKIP_KEY) === "1";
	} catch {
		return false;
	}
}

type SetupApi = {
	status: SetupStatus | null;
	error: string | null;
	loading: boolean;
	reload: () => Promise<void>;
	/** The user chose "Skip for now" on the welcome page (remembered in localStorage). */
	skipped: boolean;
	skip: () => void;
	unskip: () => void;
};

const SetupContext = createContext<SetupApi | null>(null);

/**
 * First-run state for the whole app: one fetch of GET /api/setup, the skip flag,
 * and a single redirect to /welcome on first load when setup is incomplete.
 * Navigation stays usable; nothing traps the user.
 */
export function SetupProvider({ children }: { children: ReactNode }) {
	const setup = useAsync(() => api.setup(), []);
	const [skipped, setSkipped] = useState(readSkipped);
	const navigate = useNavigate();
	const location = useLocation();
	const redirected = useRef(false);
	const { data, loading, reload, error } = setup;

	const skip = useCallback(() => {
		try {
			window.localStorage.setItem(SETUP_SKIP_KEY, "1");
		} catch {
			// private mode or blocked storage: the flag simply lives for this session
		}
		setSkipped(true);
	}, []);

	const unskip = useCallback(() => {
		try {
			window.localStorage.removeItem(SETUP_SKIP_KEY);
		} catch {
			// ignore
		}
		setSkipped(false);
	}, []);

	// Redirect once per page load, never again, so the user can navigate away freely.
	useEffect(() => {
		if (redirected.current || loading || !data) return;
		redirected.current = true;
		if (!data.complete && !skipped && location.pathname !== "/welcome") {
			navigate("/welcome", { replace: true });
		}
	}, [data, loading, skipped, location.pathname, navigate]);

	const value = useMemo<SetupApi>(
		() => ({ status: data, error, loading, reload, skipped, skip, unskip }),
		[data, error, loading, reload, skipped, skip, unskip],
	);

	return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupApi {
	const ctx = useContext(SetupContext);
	if (!ctx) throw new Error("useSetup must be used within SetupProvider");
	return ctx;
}
