import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: string | null;
  image: string;
  role: string;
  Events: Evento[]; // Ajuste conforme a estrutura dos eventos
};

export type Evento = {
  nome: string;
  banner: string; // Banner principal
  carrossel: string[]; // Lista de URLs para imagens do carrossel
  descricao: string;
  dataInicio: string; // 🔹 Alterado para data de início
  dataFim: string;
  user: User;
  LinkParaCompraIngresso: string;
  id: string;
  endereco: string;
  lat?: number;
  lng?: number;
  validate: boolean;
  validator: User;
};
