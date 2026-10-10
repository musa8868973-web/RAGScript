export function Footer() {
  return (
    <footer className="border-t px-4 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p>
          Built for <span className="text-foreground">Hacktoberfest Islamabad 2026</span> · Open AI Build Challenge ·{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://opensource.org/license/mit"
            target="_blank"
            rel="noreferrer"
          >
            MIT License
          </a>
        </p>
        <p>
          <span className="text-foreground">Muhammad Musa</span> (AI &amp; Backend Logic) ·{" "}
          <span className="text-foreground">Fatima Jawad</span> (Frontend Integration &amp; Open-Source Lead)
        </p>
      </div>
    </footer>
  );
}
