export function FooterBar() {
  return (
    <footer
      data-testid="footer-nit"
      className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 bg-background/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur"
    >
      <span data-testid="footer-atribuicao">© OpenStreetMap · © CARTO · Dados do mapa NIT</span>
      <nav aria-label="Links institucionais" className="flex gap-3">
        <a data-testid="footer-termos" href="#termos" className="underline hover:text-foreground">
          Termos e Condições
        </a>
        <a data-testid="footer-aviso" href="#aviso" className="underline hover:text-foreground">
          Aviso de Privacidade
        </a>
      </nav>
    </footer>
  )
}
