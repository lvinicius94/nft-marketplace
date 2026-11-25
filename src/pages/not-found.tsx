import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFound({ title = 'Página não encontrada', message = 'O endereço acessado não existe ou foi removido.' }: { title?: string; message?: string }) {
  return (
    <section className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div className="grid gap-4">
        <p className="text-5xl font-bold text-accent-strong">404</p>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted">{message}</p>
        <Button asChild className="mx-auto">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </section>
  )
}
