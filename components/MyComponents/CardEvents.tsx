import { Evento } from "@/types";

interface CardEventsProps {
  events: Evento[]; // Eventos filtrados passados como props
  adminId: string; // ID do administrador para as ações
}

const CardEvents: React.FC<CardEventsProps> = ({ events, adminId }) => {

    console.log("eventgos pego :",events)


    return (
        <div>
            <p>card de eventos</p>
        </div>
    )





};

export default CardEvents;
