import { WorkspaceShell } from "../components/workspace-shell";
import { LocalDataProvider } from "../components/local-data-provider";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LocalDataProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </LocalDataProvider>
  );
}
