"use client";

import { useRef, useState } from "react";

const maxSide = 400;

function resizeToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("O ficheiro não é uma imagem válida."));
    };
    image.src = objectUrl;
  });
}

export function ImageUrlField({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const attached = value.startsWith("data:image/");

  async function attach(file: File | undefined) {
    if (!file) return;
    try {
      setValue(await resizeToDataUrl(file));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível anexar a imagem.");
    }
  }

  return (
    <div className="form-field stock-modal__wide image-field">
      <span>URL da imagem</span>
      <div className="image-field__row">
        {attached
          ? <>
            <input name="imageUrl" type="hidden" value={value} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="image-field__preview" src={value} alt="" width={36} height={36} />
            <span className="image-field__attached">Imagem anexada</span>
            <button className="button button--small" type="button" onClick={() => setValue("")}>Remover</button>
          </>
          : <>
            <input name="imageUrl" type="url" placeholder="https://..." value={value} onChange={(event) => setValue(event.target.value)} />
            <button className="button button--small" type="button" onClick={() => fileInput.current?.click()}>Anexar imagem</button>
          </>}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void attach(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && <small className="image-field__error">{error}</small>}
    </div>
  );
}
