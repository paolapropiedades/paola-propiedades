import Image from 'next/image'

type BrandLogoProps = {
  className?: string
  priority?: boolean
}

export function BrandLogo({
  className = 'h-auto w-64',
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/paola-propiedades-logo.png"
      alt="Paola Cornejo - Propiedades en la playa"
      width={2048}
      height={768}
      priority={priority}
      className={className}
    />
  )
}
