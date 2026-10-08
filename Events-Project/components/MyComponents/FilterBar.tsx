"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterBarProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  statusValue: string;
  onStatusChange: (status: string) => void;
}

export function FilterBar({ filterValue, onFilterChange, statusValue, onStatusChange }: FilterBarProps) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
      <div><label htmlFor="user-search" className="mb-2 block text-sm font-medium">Buscar usuários</label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="user-search" type="search" value={filterValue} onChange={(event) => onFilterChange(event.target.value)} placeholder="Nome ou email" className="pl-10" /></div></div>
      <div>
        <label htmlFor="user-role-filter" className="mb-2 block text-sm font-medium">Permissão</label>
        <Select value={statusValue} onValueChange={onStatusChange}>
          <SelectTrigger id="user-role-filter" className="h-10 rounded-md bg-background text-foreground shadow-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background">
            <SelectValue placeholder="Todas as permissões" />
          </SelectTrigger>
          <SelectContent position="item-aligned" className="z-[60] rounded-lg border-border bg-popover p-1 text-popover-foreground shadow-lg">
            <SelectItem value="all" className="min-h-9 rounded-md px-3 py-2 pr-8">Todas as permissões</SelectItem>
            <SelectItem value="ADMIN" className="min-h-9 rounded-md px-3 py-2 pr-8">Administradores</SelectItem>
            <SelectItem value="PROMOTER" className="min-h-9 rounded-md px-3 py-2 pr-8">Promotores</SelectItem>
            <SelectItem value="BASIC" className="min-h-9 rounded-md px-3 py-2 pr-8">Usuários</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
