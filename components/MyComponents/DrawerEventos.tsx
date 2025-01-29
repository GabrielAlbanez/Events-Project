"use client";
import React, { useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import {
  Drawer as NextUIDrawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  Button,
  Image,
} from "@heroui/react";
import {
  Drawer as ShadDrawer,
  DrawerContent as ShadDrawerContent,
  DrawerHeader as ShadDrawerHeader,
  DrawerTitle as ShadDrawerTitle,
} from "@/components/ui/drawer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Tooltip } from "@heroui/tooltip";

type DrawerEventosProps = {
  evento: {
    nome: string;
    banner: string;
    carrossel: string[];
    descricao: string;
    intialDate: string;
    finishDate: string;
    LinkParaCompraIngresso: string;
    lat: number;
    lng: number;
  };
  onClose: () => void;
  onTraceRoute: () => void;
  isRouteTracing: boolean;
};

const DrawerEventos: React.FC<DrawerEventosProps> = ({
  evento,
  onClose,
  onTraceRoute,
  isRouteTracing,
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);

  const Content = (
    <>
      <p className="font-medium text-large text-default-500">{evento.nome}</p>
      {/* Banner */}
      <div className="mb-6 ">
        <Image
          isZoomed
          alt="Banner Principal"
          className=" w-full hover:scale-110"
          src={evento.banner}
        />
      </div>

      {/* Carrossel */}
      {evento.carrossel.length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium text-medium text-default-500 mb-2">
            Galeria de Imagens
          </h3>
          <Carousel className="w-full">
            <CarouselContent>
              {evento.carrossel.map((image, index) => (
                <CarouselItem key={index} className="basis-full">
                  <div className="w-full h-40 flex items-center justify-center">
                    <Image
                      isBlurred
                      isZoomed
                      alt="Banner Principal"
                      className=" w-full hover:scale-110 "
                      src={image}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}

      {/* Descrição */}
      <p className="mb-2 text-sm">
        <span className="font-medium text-small text-default-500">Data:</span>{" "}
        {evento.intialDate ? evento.intialDate : "Não definida"} -{" "}
        {evento.finishDate ? evento.finishDate : "Não definida"}
      </p>
      <p className="mb-4  font-medium text-small text-default-500">
        {evento.descricao}
      </p>

      {/* Mapa para traçar rota */}
      {directions && (
        <div className="mt-4">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "400px" }}
            center={{ lat: evento.lat, lng: evento.lng }}
            zoom={14}
          >
            <DirectionsRenderer directions={directions} />
          </GoogleMap>
        </div>
      )}
    </>
  );

  if (isDesktop) {
    // Drawer do NextUI para Desktop
    return (
      <NextUIDrawer
        isOpen={!!evento}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        backdrop="blur"
        classNames={{
          base: "data-[placement=right]:sm:m-2 data-[placement=left]:sm:m-2 rounded-medium",
        }}
      >
        <DrawerContent>
          <DrawerHeader className="absolute top-0 inset-x-0 z-50 flex flex-row  gap-4 px-2 py-2 border-b border-default-200/50 justify-between items-center bg-content1/50 backdrop-saturate-150 backdrop-blur-lg">
            <Tooltip content="close event">
              <Button
                isIconOnly
                className="text-default-400"
                size="sm"
                variant="light"
                onPress={onClose}
              >
                <svg
                  fill="none"
                  height="20"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
                </svg>
              </Button>
            </Tooltip>

            <div className="w-full flex justify-start gap-2">
              <Tooltip content="copy link event page" showArrow>
                <Button
                  className="font-medium text-small text-default-500"
                  size="sm"
                  startContent={
                    <svg
                      height="16"
                      viewBox="0 0 16 16"
                      width="16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M3.85.75c-.908 0-1.702.328-2.265.933-.558.599-.835 1.41-.835 2.29V7.88c0 .801.23 1.548.697 2.129.472.587 1.15.96 1.951 1.06a.75.75 0 1 0 .185-1.489c-.435-.054-.752-.243-.967-.51-.219-.273-.366-.673-.366-1.19V3.973c0-.568.176-.993.433-1.268.25-.27.632-.455 1.167-.455h4.146c.479 0 .828.146 1.071.359.246.215.43.54.497.979a.75.75 0 0 0 1.483-.23c-.115-.739-.447-1.4-.99-1.877C9.51 1 8.796.75 7.996.75zM7.9 4.828c-.908 0-1.702.326-2.265.93-.558.6-.835 1.41-.835 2.29v3.905c0 .879.275 1.69.833 2.289.563.605 1.357.931 2.267.931h4.144c.91 0 1.705-.326 2.268-.931.558-.599.833-1.41.833-2.289V8.048c0-.879-.275-1.69-.833-2.289-.563-.605-1.357-.931-2.267-.931zm-1.6 3.22c0-.568.176-.992.432-1.266.25-.27.632-.454 1.168-.454h4.145c.54 0 .92.185 1.17.453.255.274.43.698.43 1.267v3.905c0 .569-.175.993-.43 1.267-.25.268-.631.453-1.17.453H7.898c-.54 0-.92-.185-1.17-.453-.255-.274-.43-.698-.43-1.267z"
                        fill="currentColor"
                        fillRule="evenodd"
                      />
                    </svg>
                  }
                  variant="flat"
                >
                  Copy Link
                </Button>
              </Tooltip>
              <Tooltip content="Trace route" showArrow>
                <Button
                  onPress={onTraceRoute}
                  className="font-medium text-small text-default-500"
                  endContent={
                    <svg
                      fill="none"
                      height="16"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M7 17 17 7M7 7h10v10" />
                    </svg>
                  }
                  size="sm"
                  variant="flat"
                >
                  Trace Route
                </Button>
              </Tooltip>
            </div>
            <div className="flex gap-1 items-center">
              <Tooltip>
                <Button
                  isIconOnly
                  className="text-default-500"
                  size="sm"
                  variant="flat"
                >
                  <svg
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </Button>
              </Tooltip>
              <Tooltip>
                <Button
                  isIconOnly
                  className="text-default-500"
                  size="sm"
                  variant="flat"
                >
                  <svg
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Button>
              </Tooltip>
            </div>
          </DrawerHeader>
          <DrawerBody className="pt-16 ">{Content}</DrawerBody>
        </DrawerContent>
      </NextUIDrawer>
    );
  } else {
    // Drawer do Shadcn UI para Mobile
    return (
      <NextUIDrawer
        isOpen={!!evento}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        placement="bottom"
        backdrop="blur"
        classNames={{
          base: "data-[placement=right]:sm:m-2 data-[placement=left]:sm:m-2 rounded-medium",
        }}
      >
        <DrawerContent>
          <DrawerHeader className="flex flex-col items-start">
            <h1 className="text-2xl font-bold">{evento.nome}</h1>
          </DrawerHeader>
          <DrawerBody className="pt-4">{Content}</DrawerBody>
        </DrawerContent>
      </NextUIDrawer>
    );
  }
};

export default DrawerEventos;
