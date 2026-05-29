import { Metadata } from "next";

export const metadata: Metadata = { title: "Expense" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
