import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Dutch to track and split shared expenses with friends and groups.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
