export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 pt-2 text-[15px] leading-relaxed text-ink-soft">
      <h1 className="text-2xl font-extrabold text-ink">개인정보 처리 안내</h1>
      <p className="rounded-xl bg-honey-50 px-3 py-2 text-sm text-honey-700">
        MVP 단계의 최소 안내입니다. 정식 출시 전 개인정보보호법 및 의료 관련 규제 검토를 거쳐 보완될 수 있습니다.
      </p>
      <section>
        <h2 className="mb-1 font-bold text-ink">수집 항목</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>계정: 이메일, 표시 이름, 비밀번호(복원할 수 없는 해시로만 저장), 시간대</li>
          <li>사용자가 직접 입력한 정보: 복용 약물·용량, 투여·복용 기록, 개인 체감 패턴, 식사 컨디션, 음식 반응과 메모</li>
        </ul>
        <p className="mt-1">위치, 연락처, 사진, 체중 등은 수집하지 않습니다.</p>
      </section>
      <section>
        <h2 className="mb-1 font-bold text-ink">이용 목적</h2>
        <p>투여 경과 표시, 식사 컨디션에 맞는 음식 탐색, 개인 반응 기록, 사용자가 허용한 동반자 공유에만 사용합니다. 광고나 제3자 제공에 사용하지 않습니다.</p>
      </section>
      <section>
        <h2 className="mb-1 font-bold text-ink">공유</h2>
        <p>
          약물 관련 정보는 기본적으로 비공개입니다. 사용자가 초대 시 직접 선택한 항목만 초대를 수락한 동반자가 열람할 수 있으며, 공유 설정 변경·해제는 언제든
          가능하고 해제 즉시 접근이 차단됩니다.
        </p>
      </section>
      <section>
        <h2 className="mb-1 font-bold text-ink">보관 및 삭제</h2>
        <p>
          데이터는 Cloudflare 인프라(D1 데이터베이스)에 저장됩니다. 프로필 &gt; 회원 탈퇴에서 계정과 모든 개인 데이터를 즉시 삭제할 수 있습니다. 개별 기록도
          언제든 수정·삭제할 수 있습니다.
        </p>
      </section>
      <section>
        <h2 className="mb-1 font-bold text-ink">서비스 범위</h2>
        <p>
          잇타이밍은 의료 진단·처방을 제공하지 않습니다. 경과 표시는 시간 경과만 나타내며 혈중 농도나 약효를 뜻하지 않고, 음식 분류는 참고 정보로 특정 음식의
          안전을 보장하지 않습니다. 약물 용량이나 투여 일정 변경은 의료진과 상의하세요.
        </p>
      </section>
    </article>
  );
}
