import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/auth"],
      disallow: ["/api/", "/dashboard", "/expenses", "/groups", "/friends", "/activity", "/account", "/contacts"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
