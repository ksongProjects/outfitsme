"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";

const passthroughLoader: ImageLoader = ({ src }) => src;

export default function AppImage(props: Omit<ImageProps, "loader">) {
  const { alt, ...rest } = props;
  return <Image {...rest} alt={alt} loader={passthroughLoader} unoptimized />;
}
