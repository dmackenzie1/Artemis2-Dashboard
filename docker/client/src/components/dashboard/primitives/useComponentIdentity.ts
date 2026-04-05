import { useId } from "react";

type ComponentIdentity = {
  componentId: string;
  componentUid: string;
};

export const useComponentIdentity = (componentId: string): ComponentIdentity => {
  const reactId = useId().replace(/:/gu, "");

  return {
    componentId,
    componentUid: `${componentId}-${reactId}`
  };
};
