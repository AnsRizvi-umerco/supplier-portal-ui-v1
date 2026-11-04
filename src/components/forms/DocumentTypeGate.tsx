import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { btnSecondary } from "@/components/umerco/styles";
import { isDocumentTypeAllowed, outboundDocumentLabel } from "@/lib/document-types";
import { isTestConnectionSearch } from "@/lib/test-connection";
import { paths } from "@/paths";

export function DocumentTypeGate({
  messageType,
  children
}: {
  messageType: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  if (!isTestConnectionSearch(searchParams) && !isDocumentTypeAllowed(user, messageType)) {
    return (
      <div className="w-full min-w-0 space-y-4 py-10">
        <UmercoAlert variant="error">
          {outboundDocumentLabel(messageType)} is not enabled for this supplier. Ask your partner administrator to add it
          under document types.
        </UmercoAlert>
        <Link to={paths.schedules} className={`${btnSecondary} inline-flex text-sm`}>
          Back to Schedules
        </Link>
      </div>
    );
  }

  return children;
}
