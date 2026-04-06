declare module "wink-tokenizer" {
  type Token = {
    value: string;
    tag: string;
  };

  type Tokenizer = {
    tokenize: (text: string) => Token[];
  };

  export default function winkTokenizer(): Tokenizer;
}

declare module "stopword" {
  export function removeStopwords(tokens: string[]): string[];
}
