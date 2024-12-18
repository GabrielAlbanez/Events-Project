type Evento = {
    nome: string;
    banner: string; // Banner principal
    carrossel: string[]; // Lista de URLs para imagens do carrossel
    descrição: string;
    data: Date;
    LinkParaCompraIngresso: string;
    id: number;
    endereco: string;
    title: string;
    lat?: number;
    lng?: number;
  };

  export const dataEvents: Evento[] = [
    {
      id: 1,
      nome: "Caos",
      banner: "https://s3.playbpm.com.br/images/rodhad.2e16d0ba.fill-800x450.format-jpeg.jpegquality-85.jpg",
      carrossel: [
        "https://alataj.com.br/wp-content/uploads/2024/01/@RECREIOclubber-2-scaled.jpg",
        "https://www.wendyonline.nl/wp-content/uploads/2023/01/Unfold.art_SORA_21.jpg",
      ],
      descrição: "Clube underground com noites eletrônicas vibrantes.",
      data: new Date("2024-10-05"),
      LinkParaCompraIngresso: "https://caoscampinas.com.br/ingressos",
      endereco: "R. Luiz Otávio, 2995 - Parque Rural Fazenda Santa Cândida, Campinas - SP, 13087-560",
      title: "Caos - Campinas",
    }
  ];
  