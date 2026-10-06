import { Spinner } from "@heroui/react";

const CustomLoading = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-50">
      <Spinner  classNames={{ label: "text-blue-600 mt-4 text-lg font-semibold" }} label="Carregando..." />
    </div>
  );
};

export default CustomLoading;
