import React from "react";
import {
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@heroui/react";
import { SearchIcon, ChevronDownIcon } from "@/components/icons";
import { SidebarTrigger } from "../ui/sidebar";

interface FilterBarProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  onStatusChange: (status: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filterValue,
  onFilterChange,
  onStatusChange,
}) => {
  return (
    <div className="flex rounded-xl flex-wrap justify-between items-center gap-4 px-4 py-4 border-default-200 border-[1px] mb-4">
      <SidebarTrigger>
        <button className="text-foreground hover:text-foreground mr-3">
          ☰
        </button>
      </SidebarTrigger>
      <Input
        placeholder="Search by name.."
        startContent={<SearchIcon />}
        value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        className="w-full md:w-1/2"
      />
      <Dropdown>
        <DropdownTrigger>
          <Button endContent={<ChevronDownIcon />}>Filter by Roles</Button>
        </DropdownTrigger>
        <DropdownMenu>
          <DropdownItem onClick={() => onStatusChange("all")} key="All">
            All
          </DropdownItem>
          <DropdownItem onClick={() => onStatusChange("ADMIN")} key="Admin">
            Admin
          </DropdownItem>
          <DropdownItem
            onClick={() => onStatusChange("PROMOTER")}
            key="Promoter"
          >
            PROMOTER
          </DropdownItem>
          <DropdownItem onClick={() => onStatusChange("BASIC")} key="Basic">
            BASIC
          </DropdownItem>
          <DropdownItem onClick={() => onStatusChange("GUEST")} key="Guest">
            GUEST
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
};
