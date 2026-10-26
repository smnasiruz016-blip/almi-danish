import type { Metadata } from "next";
import { SUBJECTS } from "@/lib/seo/axes";

export const metadata: Metadata = {
  title: { absolute: "Study in Denmark — the Danish-language pathway by subject | AlmiDanish" },
  description:
    "Studying in Denmark often means meeting a Danish-language requirement. Explore the pathway by subject, with honest readiness practice — never a fabricated official result.",
  alternates: { canonical: "/study-in-denmark" },
};

export default function StudyHub() {
  return (
    <main className="bg-almi-bg text-almi-text">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-almi-ink sm:text-4xl">Study in Denmark</h1>
        <p className="mt-3 max-w-2xl text-base text-almi-text">
          Whatever you plan to study in Denmark, the step students most often underestimate is the
          Danish-language requirement — Danish-taught programmes typically expect around B2, and the
          Studieprøven is a common gateway for Danish-taught programmes. Choose a field to see the language pathway
          and practise honestly for the Danish exams — the Prøve i Dansk ladder and Studieprøven.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {SUBJECTS.map((s) => (
            <li key={s.slug}>
              <span className="block rounded-2xl border border-almi-bg-peach bg-almi-paper p-4 text-almi-ink">
                {s.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
