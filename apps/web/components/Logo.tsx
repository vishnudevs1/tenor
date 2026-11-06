import Image from "next/image";
import Link from "next/link";
import logo from "@/public/tenor-logo.png";

/** The Tenor mark on its own (rounded tile). Static import → sized, hashed and optimised by Next. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <Image src={logo} alt="" width={size} height={size} priority className={`shrink-0 rounded-[22%] ${className}`} />;
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-fg" aria-label="Tenor home">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Tenor</span>
    </Link>
  );
}
