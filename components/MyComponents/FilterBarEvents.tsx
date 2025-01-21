import React, { useState } from "react";
import {
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@nextui-org/react";
import { SearchIcon, ChevronDownIcon } from "@/components/icons";
import { SidebarTrigger } from "../ui/sidebar";

// Atualizar o tipo de onStatusChange
interface FilterBarProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  onStatusChange: (status: "all" | "verified" | "unverified") => void;
}

export const FilterBarEvents: React.FC<FilterBarProps> = ({
  filterValue,
  onFilterChange,
  onStatusChange,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<"all" | "verified" | "unverified">(
    "all"
  ); // Estado para o status selecionado

  // Função para manipular a mudança de status
  const handleStatusChange = (status: "all" | "verified" | "unverified") => {
    setSelectedStatus(status); // Atualiza o status localmente
    onStatusChange(status); // Notifica o componente pai sobre a mudança
  };

  return (
    <div className="flex rounded-xl flex-wrap justify-between items-center gap-4 px-4 py-4 border-default-200 border-[1px] mb-4">
      {/* Botão de Sidebar */}
      <SidebarTrigger>
        <button className="text-foreground hover:text-foreground mr-3">
          ☰
        </button>
      </SidebarTrigger>

      {/* Campo de Busca */}
      <Input
        placeholder="Search by name..."
        startContent={<SearchIcon />}
        value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        className="w-full md:w-1/2"
      />

      {/* Dropdown de Filtro */}
      <Dropdown>
        <DropdownTrigger>
          <Button endContent={<ChevronDownIcon />}>
            {selectedStatus === "all"
              ? "All"
              : selectedStatus === "verified"
              ? "Verified"
              : "Unverified"}
          </Button>
        </DropdownTrigger>
        <DropdownMenu>
          <DropdownItem onPress={() => handleStatusChange("all")} key="All">
            All
          </DropdownItem>
          <DropdownItem
            onPress={() => handleStatusChange("verified")}
            key="Verified"
          >
            Verified
          </DropdownItem>
          <DropdownItem
            onPress={() => handleStatusChange("unverified")}
            key="Unverified"
          >
            UnVerified
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
};
