import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <Compass className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-serif">Não encontramos esta página</h1>
          <p className="text-muted-foreground">
            O endereço pode ter mudado de lugar, ou o link não existe mais. Vamos
            te levar de volta.
          </p>
        </div>
        <Button asChild>
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
