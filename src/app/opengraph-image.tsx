import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dutch — Split expenses with friends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#10b981",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 200,
            color: "white",
            letterSpacing: "-4px",
            lineHeight: 1,
          }}
        >
          Dutch
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0px",
          }}
        >
          Split expenses with friends and groups
        </div>
      </div>
    ),
    { ...size }
  );
}
