import { LayersIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { BatchTable } from "@/components/common/batch-list";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useRunEvents } from "@/lib/events";
import { useAsync, useDocumentTitle } from "@/lib/hooks";

export function BatchesPage() {
	useDocumentTitle(`${t.batches.title} – ${t.app.name}`);
	const batches = useAsync(() => api.batches.list(50), []);
	useRunEvents(() => void batches.reload());

	return (
		<>
			<PageHeader title={t.batches.title} description={t.batches.description} />
			{batches.error && !batches.data ? (
				<ErrorState message={batches.error} onRetry={() => void batches.reload()} />
			) : null}
			{batches.loading && !batches.data ? <ListSkeleton rows={6} /> : null}
			{batches.data && batches.data.length === 0 ? (
				<EmptyState
					icon={LayersIcon}
					title={t.batches.empty}
					hint={t.batches.emptyHint}
					action={
						<Button render={<Link to="/" />} variant="outline">
							{t.nav.library}
						</Button>
					}
				/>
			) : null}
			{batches.data && batches.data.length > 0 ? <BatchTable batches={batches.data} /> : null}
		</>
	);
}
