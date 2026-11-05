"use client";

/** 본가 주소 입력 + Google Places 자동완성. 입력칸·후보 목록은 home-et 기존 UI(HeroTextInput, OptionList) 그대로 */
import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { HeroTextInput, OptionList } from "@/components/ui";
import { MAPS_KEY } from "@/components/providers";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

export function AddressInput(p: Props) {
  const input = (
    <HeroTextInput
      id={p.id}
      aria-label={p.label}
      autoFocus={p.autoFocus}
      autoComplete="off"
      placeholder={p.placeholder}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
      onEnter={p.onEnter}
    />
  );
  // 키가 없으면 APIProvider가 없으므로 자동완성 훅을 쓰지 않음
  return MAPS_KEY ? <WithSuggestions {...p} input={input} /> : input;
}

function WithSuggestions({ value, onChange, label, input }: Props & { input: React.ReactNode }) {
  const places = useMapsLibrary("places");
  const [found, setFound] = useState<string[]>([]);
  const [typing, setTyping] = useState(false); // 사용자가 직접 칠 때만 후보를 띄움 (저장된 값으로 열었을 땐 X)
  const active = !!places && typing && value.trim().length >= 2;
  const items = active ? found : [];

  useEffect(() => {
    if (!active || !places) return;
    const t = setTimeout(async () => {
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          includedRegionCodes: ["kr"],
          language: "ko",
        });
        setFound(suggestions.flatMap((s) => (s.placePrediction ? [s.placePrediction.text.toString()] : [])).slice(0, 5));
      } catch {
        setFound([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [active, places, value]);

  return (
    <div
      className="space-y-4"
      onInput={() => setTyping(true)}
    >
      {input}
      {items.length > 0 && (
        <OptionList
          label={`${label} 추천 주소`}
          options={items.map((t) => ({ value: t, label: <span className="text-[15px] font-semibold">{t}</span> }))}
          onSelect={(v) => {
            onChange(v);
            setTyping(false);
          }}
        />
      )}
    </div>
  );
}
