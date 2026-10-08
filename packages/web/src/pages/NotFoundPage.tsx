import { Link } from "react-router";
import { Page } from "../layout/Page";

export function NotFoundPage() {
  return (
    <Page eyebrow="Tix" title="Page not found">
      <p className="text-ink-muted">
        Nothing lives at this address.{" "}
        <Link to="/" className="text-accent underline">
          Go to the current sprint
        </Link>
      </p>
    </Page>
  );
}
