import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex gap-[2px] w-40">
        {["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"].map(
          (c) => (
            <span key={c} className="h-1.5 flex-1 first:rounded-l-full last:rounded-r-full" style={{ background: c }} />
          )
        )}
      </div>
      <h1 className="text-2xl text-foreground">Frozen Warehouse Launch Readiness</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Scaffold is up — Next.js, Tailwind, shadcn/ui, wired to the thermal-gradient design system.
        Schema and auth come next.
      </p>
      <Button>Sign in</Button>
    </div>
  );
}
