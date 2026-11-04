const CONNECT_ART_SRC = "/login/sketch-connect.jpg";

export function LoginSystemsBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <img
        src={CONNECT_ART_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
      />
      <div className="login-connect-veil absolute inset-0" />
      <svg
        className="absolute inset-0 hidden h-full w-full lg:block"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <g
          fill="none"
          stroke="#2563eb"
          strokeDasharray="3 7"
          strokeLinecap="round"
          strokeOpacity="0.32"
          strokeWidth="1.25"
        >
          <path d="M36 92 C 88 170 64 250 150 318" />
          <path d="M364 84 C 312 164 336 246 254 322" />
          <path d="M32 716 C 96 640 78 560 154 508" />
          <path d="M368 740 C 304 656 328 572 248 516" />
        </g>
        <g fill="#2563eb" fillOpacity="0.4">
          <circle cx="36" cy="92" r="3.5" />
          <circle cx="364" cy="84" r="3.5" />
          <circle cx="32" cy="716" r="3.5" />
          <circle cx="368" cy="740" r="3.5" />
        </g>
      </svg>
    </div>
  );
}
