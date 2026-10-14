/**
 * RC8.1 authored HTML5 acceptance driver — *real learner DOM*, not a
 * React substitute/modal, direct SCORM API calls or synthetic completion.
 *
 * Selectors are grounded in the source-backed A browser test:
 * #viewport .screen[data-unit], #count, .assessment-page,
 * [data-answer], #qNext, #next, [data-gate], [data-opt].
 * Only the private QA fixture supplies reviewed question/choice text.
 */
import {expect, type FrameLocator, type Page} from '@playwright/test';
import {requireQa, type QaChoice, type QaUnit} from './fixture-contract';

export function authoredRc81Frame(page:Page):FrameLocator {
  return page.frameLocator('iframe[title^="Conteúdo original"]');
}

function normalizeChoice(text:string):string {
  return text.replace(/\s+/g,' ').trim();
}

/** Exact visible option matching. A substring match can click another choice. */
export function resolveAuthoredChoiceIndex(
  rendered:readonly string[], expected:string,
):number {
  requireQa(typeof expected==='string'&&expected.trim().length>0,
    'RC81_REVIEWED_CHOICE_LABEL');
  const matches=rendered.flatMap((text,index)=>
    normalizeChoice(text)===normalizeChoice(expected)?[index]:[]);
  requireQa(matches.length===1, 'RC81_ORIGINAL_OPTION_NOT_UNIQUE');
  return matches[0];
}

export async function expectAuthoredRc81Unit(
  page:Page,unit:QaUnit,index:number,total:number,
):Promise<void> {
  const frame=authoredRc81Frame(page);
  const screen=frame.locator('#viewport .screen');
  await expect(screen).toHaveAttribute('data-unit',unit.id);
  await expect(frame.locator('#count')).toHaveText(`${index+1}/${total}`);
  await expect(screen.getByText(unit.visualCue,{exact:false}).first()).toBeVisible();
}

export async function answerAuthoredRc81Assessment(
  page:Page,unit:QaUnit,questions:readonly QaChoice[],
  variant:'wrong'|'correct',
):Promise<void> {
  const frame=authoredRc81Frame(page);
  requireQa(!!unit.official && unit.kind==='assessment' &&
    unit.official.stageId===unit.id && questions.length===10,
    'RC81_ORIGINAL_EIGHT_STAGES_TEN_QUESTIONS');
  const rendered=frame.locator('.assessment-page');
  await expect(rendered).toBeVisible();
  for (const [index,q] of questions.entries()) {
    // No injected script, local grade, or DOM mutation: actual authored clicks.
    await expect(rendered.getByText(q.question,{exact:false}).first()).toBeVisible();
    const options=rendered.locator('[data-answer]');
    const labels=await options.allTextContents();
    requireQa(labels.length>=2 && labels.length<=12,
      'RC81_VISIBLE_AUTHORED_OPTIONS');
    const choice=resolveAuthoredChoiceIndex(labels,q[variant]);
    await options.nth(choice).click();
    if(index<questions.length-1)await frame.locator('#qNext').click();
  }
  // In A's RC8.1 source-backed browser test this submits the ORIGINAL exam.
  // B's origin-pinned bridge then asks the Worker to grade the attempt.
  await frame.locator('#next').click();
}

export async function expectAuthoredRc81Verdict(
  page:Page,result:'failed'|'passed',
):Promise<void> {
  const frame=authoredRc81Frame(page);
  await expect(frame.locator('#next')).toContainText(
    result==='failed'?/Nova tentativa/i:/Continuar|Concluir curso/i);
}

export async function authoredRc81Retake(page:Page):Promise<void>{
  const frame=authoredRc81Frame(page);
  await expectAuthoredRc81Verdict(page,'failed');
  await frame.locator('#next').click();
  await expect(frame.locator('.assessment-page')).toBeVisible();
}

export async function satisfyAuthoredRc81Practice(page:Page,unit:QaUnit):Promise<void>{
  const frame=authoredRc81Frame(page);
  // Authored formative gates and scenario prompts are visual interactions,
  // never an official grade or learner-completion receipt.
  const gates=frame.locator('[data-gate]');
  const gateCount=await gates.count();
  for(let i=0;i<gateCount;i++)await gates.nth(i).click();
  const options=frame.locator('[data-opt]');
  if(await options.count()>0) {
    requireQa(!!unit.practice,'RC81_REVIEWED_SCENARIO_CHOICE_REQUIRED');
    const labels=await options.allTextContents();
    const index=resolveAuthoredChoiceIndex(labels,unit.practice.correct);
    await options.nth(index).click();
  }
  if(unit.practice) {
    requireQa(gateCount>0 || await options.count()>0,
      'RC81_REVIEWED_FORMATIVE_ACTIVITY_NOT_FOUND');
  }
}
