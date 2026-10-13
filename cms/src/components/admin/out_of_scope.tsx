export function OutOfScopeBanner({ feature }: { feature: string }) {
  return (
    <div className="border border-amber-200 bg-amber-50 text-amber-950 p-4 rounded-md">
      <p className="font-medium">Hors périmètre MVP — ne pas présenter comme livré</p>
      <p className="text-sm mt-1">
        {feature} n&apos;est pas un critère de livraison. Cette page n&apos;est
        pas qualifiée : pas de partenariat réel, pas de multi-tenant, pas de
        produit IA ou d&apos;examens opérationnels.
      </p>
    </div>
  );
}
