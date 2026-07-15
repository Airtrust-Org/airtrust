-- Migration 0432: Revisão completa + limpeza de manobras
-- Estratégia: rename temp → delete → rename final (evita conflitos UNIQUE)
-- Data: 2026-07-14
-- Deletadas: 114 | Renomeadas: 370

-- ============================================================
-- PASSO 0: Renomear TODAS para código temporário (evita conflito UNIQUE)
-- ============================================================

UPDATE manobras SET codigo = '_TMP_512', updated_at = datetime('now') WHERE id = 512 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_490', updated_at = datetime('now') WHERE id = 490 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_448', updated_at = datetime('now') WHERE id = 448 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_447', updated_at = datetime('now') WHERE id = 447 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_449', updated_at = datetime('now') WHERE id = 449 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_747', updated_at = datetime('now') WHERE id = 747 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_748', updated_at = datetime('now') WHERE id = 748 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_749', updated_at = datetime('now') WHERE id = 749 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_750', updated_at = datetime('now') WHERE id = 750 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_752', updated_at = datetime('now') WHERE id = 752 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_753', updated_at = datetime('now') WHERE id = 753 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_754', updated_at = datetime('now') WHERE id = 754 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_794', updated_at = datetime('now') WHERE id = 794 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_795', updated_at = datetime('now') WHERE id = 795 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_796', updated_at = datetime('now') WHERE id = 796 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_797', updated_at = datetime('now') WHERE id = 797 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_798', updated_at = datetime('now') WHERE id = 798 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_771', updated_at = datetime('now') WHERE id = 771 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_772', updated_at = datetime('now') WHERE id = 772 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_774', updated_at = datetime('now') WHERE id = 774 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_775', updated_at = datetime('now') WHERE id = 775 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_776', updated_at = datetime('now') WHERE id = 776 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_777', updated_at = datetime('now') WHERE id = 777 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_778', updated_at = datetime('now') WHERE id = 778 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_635', updated_at = datetime('now') WHERE id = 635 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_636', updated_at = datetime('now') WHERE id = 636 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_637', updated_at = datetime('now') WHERE id = 637 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_548', updated_at = datetime('now') WHERE id = 548 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_530', updated_at = datetime('now') WHERE id = 530 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_582', updated_at = datetime('now') WHERE id = 582 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_547', updated_at = datetime('now') WHERE id = 547 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_509', updated_at = datetime('now') WHERE id = 509 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_564', updated_at = datetime('now') WHERE id = 564 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_531', updated_at = datetime('now') WHERE id = 531 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_546', updated_at = datetime('now') WHERE id = 546 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_563', updated_at = datetime('now') WHERE id = 563 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_451', updated_at = datetime('now') WHERE id = 451 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_450', updated_at = datetime('now') WHERE id = 450 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_454', updated_at = datetime('now') WHERE id = 454 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_453', updated_at = datetime('now') WHERE id = 453 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_452', updated_at = datetime('now') WHERE id = 452 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_805', updated_at = datetime('now') WHERE id = 805 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_806', updated_at = datetime('now') WHERE id = 806 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_807', updated_at = datetime('now') WHERE id = 807 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_816', updated_at = datetime('now') WHERE id = 816 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_817', updated_at = datetime('now') WHERE id = 817 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_818', updated_at = datetime('now') WHERE id = 818 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_751', updated_at = datetime('now') WHERE id = 751 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_755', updated_at = datetime('now') WHERE id = 755 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_756', updated_at = datetime('now') WHERE id = 756 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_757', updated_at = datetime('now') WHERE id = 757 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_799', updated_at = datetime('now') WHERE id = 799 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_800', updated_at = datetime('now') WHERE id = 800 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_801', updated_at = datetime('now') WHERE id = 801 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_779', updated_at = datetime('now') WHERE id = 779 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_638', updated_at = datetime('now') WHERE id = 638 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_639', updated_at = datetime('now') WHERE id = 639 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_560', updated_at = datetime('now') WHERE id = 560 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_586', updated_at = datetime('now') WHERE id = 586 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_528', updated_at = datetime('now') WHERE id = 528 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_525', updated_at = datetime('now') WHERE id = 525 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_572', updated_at = datetime('now') WHERE id = 572 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_558', updated_at = datetime('now') WHERE id = 558 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_584', updated_at = datetime('now') WHERE id = 584 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_559', updated_at = datetime('now') WHERE id = 559 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_593', updated_at = datetime('now') WHERE id = 593 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_544', updated_at = datetime('now') WHERE id = 544 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_561', updated_at = datetime('now') WHERE id = 561 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_503', updated_at = datetime('now') WHERE id = 503 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_557', updated_at = datetime('now') WHERE id = 557 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_524', updated_at = datetime('now') WHERE id = 524 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_554', updated_at = datetime('now') WHERE id = 554 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_519', updated_at = datetime('now') WHERE id = 519 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_585', updated_at = datetime('now') WHERE id = 585 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_520', updated_at = datetime('now') WHERE id = 520 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_545', updated_at = datetime('now') WHERE id = 545 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_588', updated_at = datetime('now') WHERE id = 588 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_587', updated_at = datetime('now') WHERE id = 587 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_555', updated_at = datetime('now') WHERE id = 555 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_553', updated_at = datetime('now') WHERE id = 553 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_562', updated_at = datetime('now') WHERE id = 562 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_522', updated_at = datetime('now') WHERE id = 522 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_575', updated_at = datetime('now') WHERE id = 575 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_574', updated_at = datetime('now') WHERE id = 574 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_573', updated_at = datetime('now') WHERE id = 573 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_518', updated_at = datetime('now') WHERE id = 518 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_527', updated_at = datetime('now') WHERE id = 527 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_507', updated_at = datetime('now') WHERE id = 507 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_508', updated_at = datetime('now') WHERE id = 508 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_536', updated_at = datetime('now') WHERE id = 536 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_538', updated_at = datetime('now') WHERE id = 538 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_589', updated_at = datetime('now') WHERE id = 589 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_578', updated_at = datetime('now') WHERE id = 578 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_591', updated_at = datetime('now') WHERE id = 591 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_539', updated_at = datetime('now') WHERE id = 539 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_590', updated_at = datetime('now') WHERE id = 590 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_541', updated_at = datetime('now') WHERE id = 541 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_540', updated_at = datetime('now') WHERE id = 540 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_505', updated_at = datetime('now') WHERE id = 505 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_577', updated_at = datetime('now') WHERE id = 577 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_504', updated_at = datetime('now') WHERE id = 504 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_521', updated_at = datetime('now') WHERE id = 521 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_576', updated_at = datetime('now') WHERE id = 576 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_523', updated_at = datetime('now') WHERE id = 523 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_571', updated_at = datetime('now') WHERE id = 571 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_592', updated_at = datetime('now') WHERE id = 592 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_543', updated_at = datetime('now') WHERE id = 543 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_506', updated_at = datetime('now') WHERE id = 506 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_556', updated_at = datetime('now') WHERE id = 556 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_579', updated_at = datetime('now') WHERE id = 579 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_580', updated_at = datetime('now') WHERE id = 580 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_542', updated_at = datetime('now') WHERE id = 542 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_526', updated_at = datetime('now') WHERE id = 526 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_594', updated_at = datetime('now') WHERE id = 594 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_537', updated_at = datetime('now') WHERE id = 537 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_813', updated_at = datetime('now') WHERE id = 813 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_516', updated_at = datetime('now') WHERE id = 516 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_515', updated_at = datetime('now') WHERE id = 515 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_499', updated_at = datetime('now') WHERE id = 499 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_500', updated_at = datetime('now') WHERE id = 500 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_498', updated_at = datetime('now') WHERE id = 498 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_529', updated_at = datetime('now') WHERE id = 529 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_459', updated_at = datetime('now') WHERE id = 459 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_461', updated_at = datetime('now') WHERE id = 461 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_458', updated_at = datetime('now') WHERE id = 458 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_455', updated_at = datetime('now') WHERE id = 455 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_456', updated_at = datetime('now') WHERE id = 456 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_460', updated_at = datetime('now') WHERE id = 460 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_457', updated_at = datetime('now') WHERE id = 457 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_743', updated_at = datetime('now') WHERE id = 743 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_746', updated_at = datetime('now') WHERE id = 746 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_791', updated_at = datetime('now') WHERE id = 791 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_792', updated_at = datetime('now') WHERE id = 792 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_793', updated_at = datetime('now') WHERE id = 793 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_768', updated_at = datetime('now') WHERE id = 768 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_769', updated_at = datetime('now') WHERE id = 769 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_770', updated_at = datetime('now') WHERE id = 770 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_773', updated_at = datetime('now') WHERE id = 773 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_630', updated_at = datetime('now') WHERE id = 630 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_631', updated_at = datetime('now') WHERE id = 631 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_632', updated_at = datetime('now') WHERE id = 632 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_633', updated_at = datetime('now') WHERE id = 633 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_634', updated_at = datetime('now') WHERE id = 634 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_893', updated_at = datetime('now') WHERE id = 893 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_913', updated_at = datetime('now') WHERE id = 913 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_922', updated_at = datetime('now') WHERE id = 922 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_989', updated_at = datetime('now') WHERE id = 989 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_958', updated_at = datetime('now') WHERE id = 958 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_809', updated_at = datetime('now') WHERE id = 809 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_810', updated_at = datetime('now') WHERE id = 810 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_820', updated_at = datetime('now') WHERE id = 820 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_821', updated_at = datetime('now') WHERE id = 821 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_822', updated_at = datetime('now') WHERE id = 822 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_496', updated_at = datetime('now') WHERE id = 496 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_495', updated_at = datetime('now') WHERE id = 495 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_497', updated_at = datetime('now') WHERE id = 497 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_930', updated_at = datetime('now') WHERE id = 930 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_550', updated_at = datetime('now') WHERE id = 550 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_802', updated_at = datetime('now') WHERE id = 802 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_812', updated_at = datetime('now') WHERE id = 812 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_814', updated_at = datetime('now') WHERE id = 814 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_830', updated_at = datetime('now') WHERE id = 830 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_534', updated_at = datetime('now') WHERE id = 534 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_491', updated_at = datetime('now') WHERE id = 491 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_492', updated_at = datetime('now') WHERE id = 492 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_915', updated_at = datetime('now') WHERE id = 915 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_916', updated_at = datetime('now') WHERE id = 916 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_934', updated_at = datetime('now') WHERE id = 934 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_937', updated_at = datetime('now') WHERE id = 937 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_510', updated_at = datetime('now') WHERE id = 510 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_532', updated_at = datetime('now') WHERE id = 532 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_511', updated_at = datetime('now') WHERE id = 511 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_533', updated_at = datetime('now') WHERE id = 533 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_549', updated_at = datetime('now') WHERE id = 549 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_565', updated_at = datetime('now') WHERE id = 565 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_566', updated_at = datetime('now') WHERE id = 566 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_595', updated_at = datetime('now') WHERE id = 595 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_475', updated_at = datetime('now') WHERE id = 475 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_464', updated_at = datetime('now') WHERE id = 464 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_465', updated_at = datetime('now') WHERE id = 465 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_463', updated_at = datetime('now') WHERE id = 463 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_462', updated_at = datetime('now') WHERE id = 462 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_473', updated_at = datetime('now') WHERE id = 473 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_472', updated_at = datetime('now') WHERE id = 472 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_471', updated_at = datetime('now') WHERE id = 471 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_476', updated_at = datetime('now') WHERE id = 476 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_480', updated_at = datetime('now') WHERE id = 480 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_479', updated_at = datetime('now') WHERE id = 479 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_478', updated_at = datetime('now') WHERE id = 478 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_470', updated_at = datetime('now') WHERE id = 470 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_466', updated_at = datetime('now') WHERE id = 466 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_467', updated_at = datetime('now') WHERE id = 467 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_469', updated_at = datetime('now') WHERE id = 469 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_468', updated_at = datetime('now') WHERE id = 468 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_477', updated_at = datetime('now') WHERE id = 477 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_474', updated_at = datetime('now') WHERE id = 474 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_736', updated_at = datetime('now') WHERE id = 736 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_737', updated_at = datetime('now') WHERE id = 737 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_738', updated_at = datetime('now') WHERE id = 738 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_739', updated_at = datetime('now') WHERE id = 739 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_780', updated_at = datetime('now') WHERE id = 780 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_781', updated_at = datetime('now') WHERE id = 781 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_782', updated_at = datetime('now') WHERE id = 782 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_783', updated_at = datetime('now') WHERE id = 783 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_758', updated_at = datetime('now') WHERE id = 758 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_759', updated_at = datetime('now') WHERE id = 759 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_760', updated_at = datetime('now') WHERE id = 760 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_761', updated_at = datetime('now') WHERE id = 761 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_618', updated_at = datetime('now') WHERE id = 618 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_619', updated_at = datetime('now') WHERE id = 619 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_620', updated_at = datetime('now') WHERE id = 620 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_621', updated_at = datetime('now') WHERE id = 621 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_898', updated_at = datetime('now') WHERE id = 898 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_899', updated_at = datetime('now') WHERE id = 899 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_900', updated_at = datetime('now') WHERE id = 900 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_901', updated_at = datetime('now') WHERE id = 901 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_902', updated_at = datetime('now') WHERE id = 902 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_903', updated_at = datetime('now') WHERE id = 903 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_918', updated_at = datetime('now') WHERE id = 918 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_445', updated_at = datetime('now') WHERE id = 445 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_446', updated_at = datetime('now') WHERE id = 446 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_444', updated_at = datetime('now') WHERE id = 444 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_442', updated_at = datetime('now') WHERE id = 442 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_443', updated_at = datetime('now') WHERE id = 443 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_372', updated_at = datetime('now') WHERE id = 372 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_373', updated_at = datetime('now') WHERE id = 373 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_374', updated_at = datetime('now') WHERE id = 374 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_375', updated_at = datetime('now') WHERE id = 375 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_376', updated_at = datetime('now') WHERE id = 376 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_377', updated_at = datetime('now') WHERE id = 377 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_378', updated_at = datetime('now') WHERE id = 378 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_379', updated_at = datetime('now') WHERE id = 379 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_369', updated_at = datetime('now') WHERE id = 369 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_370', updated_at = datetime('now') WHERE id = 370 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_371', updated_at = datetime('now') WHERE id = 371 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_380', updated_at = datetime('now') WHERE id = 380 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_381', updated_at = datetime('now') WHERE id = 381 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_811', updated_at = datetime('now') WHERE id = 811 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_803', updated_at = datetime('now') WHERE id = 803 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_804', updated_at = datetime('now') WHERE id = 804 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_808', updated_at = datetime('now') WHERE id = 808 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_815', updated_at = datetime('now') WHERE id = 815 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_819', updated_at = datetime('now') WHERE id = 819 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_489', updated_at = datetime('now') WHERE id = 489 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_486', updated_at = datetime('now') WHERE id = 486 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_483', updated_at = datetime('now') WHERE id = 483 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_488', updated_at = datetime('now') WHERE id = 488 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_482', updated_at = datetime('now') WHERE id = 482 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_481', updated_at = datetime('now') WHERE id = 481 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_485', updated_at = datetime('now') WHERE id = 485 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_484', updated_at = datetime('now') WHERE id = 484 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_487', updated_at = datetime('now') WHERE id = 487 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_740', updated_at = datetime('now') WHERE id = 740 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_741', updated_at = datetime('now') WHERE id = 741 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_742', updated_at = datetime('now') WHERE id = 742 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_784', updated_at = datetime('now') WHERE id = 784 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_785', updated_at = datetime('now') WHERE id = 785 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_786', updated_at = datetime('now') WHERE id = 786 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_762', updated_at = datetime('now') WHERE id = 762 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_763', updated_at = datetime('now') WHERE id = 763 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_764', updated_at = datetime('now') WHERE id = 764 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_622', updated_at = datetime('now') WHERE id = 622 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_623', updated_at = datetime('now') WHERE id = 623 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_624', updated_at = datetime('now') WHERE id = 624 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_625', updated_at = datetime('now') WHERE id = 625 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_551', updated_at = datetime('now') WHERE id = 551 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_513', updated_at = datetime('now') WHERE id = 513 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_567', updated_at = datetime('now') WHERE id = 567 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_493', updated_at = datetime('now') WHERE id = 493 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_494', updated_at = datetime('now') WHERE id = 494 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_552', updated_at = datetime('now') WHERE id = 552 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_514', updated_at = datetime('now') WHERE id = 514 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_568', updated_at = datetime('now') WHERE id = 568 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_569', updated_at = datetime('now') WHERE id = 569 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_502', updated_at = datetime('now') WHERE id = 502 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_501', updated_at = datetime('now') WHERE id = 501 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_535', updated_at = datetime('now') WHERE id = 535 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_570', updated_at = datetime('now') WHERE id = 570 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_517', updated_at = datetime('now') WHERE id = 517 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_891', updated_at = datetime('now') WHERE id = 891 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_892', updated_at = datetime('now') WHERE id = 892 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_894', updated_at = datetime('now') WHERE id = 894 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_895', updated_at = datetime('now') WHERE id = 895 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_896', updated_at = datetime('now') WHERE id = 896 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_897', updated_at = datetime('now') WHERE id = 897 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_904', updated_at = datetime('now') WHERE id = 904 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_905', updated_at = datetime('now') WHERE id = 905 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_906', updated_at = datetime('now') WHERE id = 906 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_907', updated_at = datetime('now') WHERE id = 907 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_908', updated_at = datetime('now') WHERE id = 908 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_909', updated_at = datetime('now') WHERE id = 909 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_910', updated_at = datetime('now') WHERE id = 910 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_911', updated_at = datetime('now') WHERE id = 911 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_912', updated_at = datetime('now') WHERE id = 912 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_914', updated_at = datetime('now') WHERE id = 914 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_917', updated_at = datetime('now') WHERE id = 917 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_919', updated_at = datetime('now') WHERE id = 919 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_920', updated_at = datetime('now') WHERE id = 920 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_921', updated_at = datetime('now') WHERE id = 921 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_923', updated_at = datetime('now') WHERE id = 923 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_924', updated_at = datetime('now') WHERE id = 924 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_925', updated_at = datetime('now') WHERE id = 925 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_926', updated_at = datetime('now') WHERE id = 926 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_927', updated_at = datetime('now') WHERE id = 927 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_928', updated_at = datetime('now') WHERE id = 928 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_929', updated_at = datetime('now') WHERE id = 929 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_988', updated_at = datetime('now') WHERE id = 988 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_990', updated_at = datetime('now') WHERE id = 990 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_992', updated_at = datetime('now') WHERE id = 992 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_993', updated_at = datetime('now') WHERE id = 993 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_994', updated_at = datetime('now') WHERE id = 994 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_995', updated_at = datetime('now') WHERE id = 995 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_996', updated_at = datetime('now') WHERE id = 996 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_1002', updated_at = datetime('now') WHERE id = 1002 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_997', updated_at = datetime('now') WHERE id = 997 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_998', updated_at = datetime('now') WHERE id = 998 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_999', updated_at = datetime('now') WHERE id = 999 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_1000', updated_at = datetime('now') WHERE id = 1000 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_931', updated_at = datetime('now') WHERE id = 931 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_932', updated_at = datetime('now') WHERE id = 932 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_933', updated_at = datetime('now') WHERE id = 933 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_936', updated_at = datetime('now') WHERE id = 936 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_938', updated_at = datetime('now') WHERE id = 938 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_939', updated_at = datetime('now') WHERE id = 939 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_947', updated_at = datetime('now') WHERE id = 947 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_948', updated_at = datetime('now') WHERE id = 948 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_949', updated_at = datetime('now') WHERE id = 949 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_950', updated_at = datetime('now') WHERE id = 950 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_951', updated_at = datetime('now') WHERE id = 951 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_952', updated_at = datetime('now') WHERE id = 952 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_953', updated_at = datetime('now') WHERE id = 953 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_954', updated_at = datetime('now') WHERE id = 954 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_955', updated_at = datetime('now') WHERE id = 955 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_957', updated_at = datetime('now') WHERE id = 957 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_959', updated_at = datetime('now') WHERE id = 959 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_960', updated_at = datetime('now') WHERE id = 960 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_961', updated_at = datetime('now') WHERE id = 961 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_962', updated_at = datetime('now') WHERE id = 962 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_963', updated_at = datetime('now') WHERE id = 963 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_964', updated_at = datetime('now') WHERE id = 964 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_965', updated_at = datetime('now') WHERE id = 965 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_966', updated_at = datetime('now') WHERE id = 966 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_967', updated_at = datetime('now') WHERE id = 967 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_968', updated_at = datetime('now') WHERE id = 968 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_969', updated_at = datetime('now') WHERE id = 969 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_970', updated_at = datetime('now') WHERE id = 970 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_744', updated_at = datetime('now') WHERE id = 744 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_745', updated_at = datetime('now') WHERE id = 745 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_787', updated_at = datetime('now') WHERE id = 787 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_788', updated_at = datetime('now') WHERE id = 788 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_789', updated_at = datetime('now') WHERE id = 789 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_790', updated_at = datetime('now') WHERE id = 790 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_765', updated_at = datetime('now') WHERE id = 765 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_766', updated_at = datetime('now') WHERE id = 766 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_767', updated_at = datetime('now') WHERE id = 767 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_626', updated_at = datetime('now') WHERE id = 626 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_627', updated_at = datetime('now') WHERE id = 627 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_628', updated_at = datetime('now') WHERE id = 628 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_629', updated_at = datetime('now') WHERE id = 629 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_439', updated_at = datetime('now') WHERE id = 439 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_441', updated_at = datetime('now') WHERE id = 441 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_440', updated_at = datetime('now') WHERE id = 440 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_436', updated_at = datetime('now') WHERE id = 436 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_437', updated_at = datetime('now') WHERE id = 437 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_438', updated_at = datetime('now') WHERE id = 438 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_368', updated_at = datetime('now') WHERE id = 368 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_364', updated_at = datetime('now') WHERE id = 364 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_365', updated_at = datetime('now') WHERE id = 365 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_366', updated_at = datetime('now') WHERE id = 366 AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE manobras SET codigo = '_TMP_367', updated_at = datetime('now') WHERE id = 367 AND empresa_id = 6 AND deleted_at IS NULL;

-- ============================================================
-- PASSO 1: Soft-delete das manobras não usadas
-- ============================================================

-- S76-BHT-52 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 581 AND empresa_id = 6 AND deleted_at IS NULL;
-- A139-AUT-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1001 AND empresa_id = 6 AND deleted_at IS NULL;
-- OPS-NOT-X1 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1003 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-MED-00 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 583 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1004 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1005 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1006 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1007 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1008 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1009 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-07 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1010 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-08 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1011 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-09 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1012 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-10 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1013 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-11 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1014 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-12 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1015 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-13 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1016 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-14 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1017 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-15 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1018 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-16 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1019 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-17 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1020 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V01-18 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1021 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1022 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1023 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1024 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1025 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1026 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1027 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-07 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1028 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-08 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1029 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-09 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1030 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-10 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1031 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-11 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1032 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-12 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1033 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-13 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1034 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-14 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1035 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-15 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1036 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-16 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1037 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-17 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1038 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V02-18 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1039 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1040 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1041 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1042 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1043 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1044 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1045 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-07 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1046 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-08 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1047 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-09 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1048 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-10 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1049 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-11 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1050 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-12 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1051 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-13 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1052 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-14 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1053 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-15 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1054 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-16 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1055 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-17 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1056 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V03-18 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1057 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1058 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1059 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1060 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1061 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1062 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1063 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-07 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1064 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-08 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1065 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-09 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1066 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-10 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1067 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-11 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1068 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-12 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1069 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-13 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1070 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-14 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1071 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-15 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1072 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-16 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1073 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-17 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1074 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-V04-18 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 1075 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-ATC-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 828 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-CRM-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 829 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 697 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 698 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 699 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 700 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 701 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 702 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-07 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 703 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-INS-08 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 704 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CRM-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 709 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CRM-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 710 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CRM-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 711 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CRM-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 712 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CRM-05 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 713 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-MAN-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 705 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-MAN-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 706 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-MAN-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 707 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-MAN-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 708 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-APX-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 935 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-PRE-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 823 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-PRE-02 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 824 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-PRE-03 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 825 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-PRE-04 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 826 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-COM-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 827 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-ADM-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 977 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-BRF-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 978 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-DBF-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 979 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-DEC-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 980 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-EMR-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 981 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-FAP-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 982 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-PAD-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 983 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-PLN-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 984 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-RSK-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 985 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-SCN-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 986 AND empresa_id = 6 AND deleted_at IS NULL;
-- EXA-STD-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 987 AND empresa_id = 6 AND deleted_at IS NULL;
-- INV-CGE-06 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 991 AND empresa_id = 6 AND deleted_at IS NULL;
-- S76-IDF-01 → DELETED
UPDATE manobras SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = 956 AND empresa_id = 6 AND deleted_at IS NULL;

-- ============================================================
-- PASSO 2: Renomear para códigos finais + atualizar referências
-- ============================================================

-- S76-NIF-00 → S76-ACI-02
UPDATE manobras SET codigo = 'S76-ACI-02', updated_at = datetime('now') WHERE id = 512 AND codigo = '_TMP_512' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ACI-02', updated_at = datetime('now') WHERE codigo = 'S76-NIF-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ACI-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NIF-00' AND deleted_at IS NULL;
-- S76-NVF-00 → S76-ACI-01
UPDATE manobras SET codigo = 'S76-ACI-01', updated_at = datetime('now') WHERE id = 490 AND codigo = '_TMP_490' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ACI-01', updated_at = datetime('now') WHERE codigo = 'S76-NVF-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ACI-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NVF-00' AND deleted_at IS NULL;
-- 76-FALFD → S76-AFC-01
UPDATE manobras SET codigo = 'S76-AFC-01', updated_at = datetime('now') WHERE id = 448 AND codigo = '_TMP_448' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AFC-01', updated_at = datetime('now') WHERE codigo = '76-FALFD' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AFC-01', updated_at = datetime('now') WHERE codigo_manobra = '76-FALFD' AND deleted_at IS NULL;
-- 76-FALPA → S76-AFC-02
UPDATE manobras SET codigo = 'S76-AFC-02', updated_at = datetime('now') WHERE id = 447 AND codigo = '_TMP_447' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AFC-02', updated_at = datetime('now') WHERE codigo = '76-FALPA' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AFC-02', updated_at = datetime('now') WHERE codigo_manobra = '76-FALPA' AND deleted_at IS NULL;
-- 76-FALTS → S76-AFC-03
UPDATE manobras SET codigo = 'S76-AFC-03', updated_at = datetime('now') WHERE id = 449 AND codigo = '_TMP_449' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AFC-03', updated_at = datetime('now') WHERE codigo = '76-FALTS' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AFC-03', updated_at = datetime('now') WHERE codigo_manobra = '76-FALTS' AND deleted_at IS NULL;
-- LOFT-CHK-12 → A139-CHK-12
UPDATE manobras SET codigo = 'A139-CHK-12', updated_at = datetime('now') WHERE id = 747 AND codigo = '_TMP_747' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-12', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-12' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-12', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-12' AND deleted_at IS NULL;
-- LOFT-CHK-13 → A139-CHK-13
UPDATE manobras SET codigo = 'A139-CHK-13', updated_at = datetime('now') WHERE id = 748 AND codigo = '_TMP_748' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-13', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-13' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-13', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-13' AND deleted_at IS NULL;
-- LOFT-CHK-14 → A139-CHK-14
UPDATE manobras SET codigo = 'A139-CHK-14', updated_at = datetime('now') WHERE id = 749 AND codigo = '_TMP_749' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-14', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-14' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-14', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-14' AND deleted_at IS NULL;
-- LOFT-CHK-15 → A139-CHK-15
UPDATE manobras SET codigo = 'A139-CHK-15', updated_at = datetime('now') WHERE id = 750 AND codigo = '_TMP_750' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-15', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-15', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-15' AND deleted_at IS NULL;
-- LOFT-CHK-17 → A139-CHK-17
UPDATE manobras SET codigo = 'A139-CHK-17', updated_at = datetime('now') WHERE id = 752 AND codigo = '_TMP_752' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-17', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-17', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-17' AND deleted_at IS NULL;
-- LOFT-CHK-18 → A139-CHK-18
UPDATE manobras SET codigo = 'A139-CHK-18', updated_at = datetime('now') WHERE id = 753 AND codigo = '_TMP_753' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-18', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-18', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-18' AND deleted_at IS NULL;
-- LOFT-CHK-19 → A139-CHK-19
UPDATE manobras SET codigo = 'A139-CHK-19', updated_at = datetime('now') WHERE id = 754 AND codigo = '_TMP_754' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-19', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-19' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-19', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-19' AND deleted_at IS NULL;
-- LOFT-NOT-15 → A139-NOT-15
UPDATE manobras SET codigo = 'A139-NOT-15', updated_at = datetime('now') WHERE id = 794 AND codigo = '_TMP_794' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-15', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-15', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-15' AND deleted_at IS NULL;
-- LOFT-NOT-16 → A139-NOT-16
UPDATE manobras SET codigo = 'A139-NOT-16', updated_at = datetime('now') WHERE id = 795 AND codigo = '_TMP_795' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-16', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-16' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-16', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-16' AND deleted_at IS NULL;
-- LOFT-NOT-17 → A139-NOT-17
UPDATE manobras SET codigo = 'A139-NOT-17', updated_at = datetime('now') WHERE id = 796 AND codigo = '_TMP_796' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-17', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-17', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-17' AND deleted_at IS NULL;
-- LOFT-NOT-18 → A139-NOT-18
UPDATE manobras SET codigo = 'A139-NOT-18', updated_at = datetime('now') WHERE id = 797 AND codigo = '_TMP_797' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-18', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-18', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-18' AND deleted_at IS NULL;
-- LOFT-NOT-19 → A139-NOT-19
UPDATE manobras SET codigo = 'A139-NOT-19', updated_at = datetime('now') WHERE id = 798 AND codigo = '_TMP_798' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-19', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-19' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-19', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-19' AND deleted_at IS NULL;
-- LOFT-OFF-14 → A139-OFF-14
UPDATE manobras SET codigo = 'A139-OFF-14', updated_at = datetime('now') WHERE id = 771 AND codigo = '_TMP_771' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-14', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-14' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-14', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-14' AND deleted_at IS NULL;
-- LOFT-OFF-15 → A139-OFF-15
UPDATE manobras SET codigo = 'A139-OFF-15', updated_at = datetime('now') WHERE id = 772 AND codigo = '_TMP_772' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-15', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-15', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-15' AND deleted_at IS NULL;
-- LOFT-OFF-17 → A139-OFF-17
UPDATE manobras SET codigo = 'A139-OFF-17', updated_at = datetime('now') WHERE id = 774 AND codigo = '_TMP_774' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-17', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-17', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-17' AND deleted_at IS NULL;
-- LOFT-OFF-18 → A139-OFF-18
UPDATE manobras SET codigo = 'A139-OFF-18', updated_at = datetime('now') WHERE id = 775 AND codigo = '_TMP_775' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-18', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-18', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-18' AND deleted_at IS NULL;
-- LOFT-OFF-19 → A139-OFF-19
UPDATE manobras SET codigo = 'A139-OFF-19', updated_at = datetime('now') WHERE id = 776 AND codigo = '_TMP_776' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-19', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-19' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-19', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-19' AND deleted_at IS NULL;
-- LOFT-OFF-20 → A139-OFF-20
UPDATE manobras SET codigo = 'A139-OFF-20', updated_at = datetime('now') WHERE id = 777 AND codigo = '_TMP_777' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-20', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-20', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-20' AND deleted_at IS NULL;
-- LOFT-OFF-21 → A139-OFF-21
UPDATE manobras SET codigo = 'A139-OFF-21', updated_at = datetime('now') WHERE id = 778 AND codigo = '_TMP_778' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-21', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-21', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-21' AND deleted_at IS NULL;
-- S76-LOFT-18 → S76-LFT-18
UPDATE manobras SET codigo = 'S76-LFT-18', updated_at = datetime('now') WHERE id = 635 AND codigo = '_TMP_635' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-18', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-18', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-18' AND deleted_at IS NULL;
-- S76-LOFT-19 → S76-LFT-19
UPDATE manobras SET codigo = 'S76-LFT-19', updated_at = datetime('now') WHERE id = 636 AND codigo = '_TMP_636' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-19', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-19' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-19', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-19' AND deleted_at IS NULL;
-- S76-LOFT-20 → S76-LFT-20
UPDATE manobras SET codigo = 'S76-LFT-20', updated_at = datetime('now') WHERE id = 637 AND codigo = '_TMP_637' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-20', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-20', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-20' AND deleted_at IS NULL;
-- S76-DIT-71 → S76-APR-71
UPDATE manobras SET codigo = 'S76-APR-71', updated_at = datetime('now') WHERE id = 548 AND codigo = '_TMP_548' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-71', updated_at = datetime('now') WHERE codigo = 'S76-DIT-71' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-71', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DIT-71' AND deleted_at IS NULL;
-- S76-EFV-11 → S76-APR-11
UPDATE manobras SET codigo = 'S76-APR-11', updated_at = datetime('now') WHERE id = 530 AND codigo = '_TMP_530' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-11', updated_at = datetime('now') WHERE codigo = 'S76-EFV-11' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-11', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EFV-11' AND deleted_at IS NULL;
-- S76-FCD-67 → S76-APR-67
UPDATE manobras SET codigo = 'S76-APR-67', updated_at = datetime('now') WHERE id = 582 AND codigo = '_TMP_582' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-67', updated_at = datetime('now') WHERE codigo = 'S76-FCD-67' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-67', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FCD-67' AND deleted_at IS NULL;
-- S76-LGB-47 → S76-APR-47
UPDATE manobras SET codigo = 'S76-APR-47', updated_at = datetime('now') WHERE id = 547 AND codigo = '_TMP_547' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-47', updated_at = datetime('now') WHERE codigo = 'S76-LGB-47' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-47', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LGB-47' AND deleted_at IS NULL;
-- S76-LGE-44 → S76-APR-44
UPDATE manobras SET codigo = 'S76-APR-44', updated_at = datetime('now') WHERE id = 509 AND codigo = '_TMP_509' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-44', updated_at = datetime('now') WHERE codigo = 'S76-LGE-44' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-44', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LGE-44' AND deleted_at IS NULL;
-- S76-PTH-55 → S76-APR-55
UPDATE manobras SET codigo = 'S76-APR-55', updated_at = datetime('now') WHERE id = 564 AND codigo = '_TMP_564' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-55', updated_at = datetime('now') WHERE codigo = 'S76-PTH-55' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-55', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PTH-55' AND deleted_at IS NULL;
-- S76-UGE-46 → S76-APR-46
UPDATE manobras SET codigo = 'S76-APR-46', updated_at = datetime('now') WHERE id = 531 AND codigo = '_TMP_531' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-46', updated_at = datetime('now') WHERE codigo = 'S76-UGE-46' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-46', updated_at = datetime('now') WHERE codigo_manobra = 'S76-UGE-46' AND deleted_at IS NULL;
-- S76-UGR-46 → S76-APR-46A
UPDATE manobras SET codigo = 'S76-APR-46A', updated_at = datetime('now') WHERE id = 546 AND codigo = '_TMP_546' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-46A', updated_at = datetime('now') WHERE codigo = 'S76-UGR-46' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-46A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-UGR-46' AND deleted_at IS NULL;
-- S76-WSH-54 → S76-APR-54
UPDATE manobras SET codigo = 'S76-APR-54', updated_at = datetime('now') WHERE id = 563 AND codigo = '_TMP_563' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-APR-54', updated_at = datetime('now') WHERE codigo = 'S76-WSH-54' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-APR-54', updated_at = datetime('now') WHERE codigo_manobra = 'S76-WSH-54' AND deleted_at IS NULL;
-- 76-FALAD → S76-AVI-01
UPDATE manobras SET codigo = 'S76-AVI-01', updated_at = datetime('now') WHERE id = 451 AND codigo = '_TMP_451' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AVI-01', updated_at = datetime('now') WHERE codigo = '76-FALAD' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AVI-01', updated_at = datetime('now') WHERE codigo_manobra = '76-FALAD' AND deleted_at IS NULL;
-- 76-FALEF → S76-AVI-02
UPDATE manobras SET codigo = 'S76-AVI-02', updated_at = datetime('now') WHERE id = 450 AND codigo = '_TMP_450' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AVI-02', updated_at = datetime('now') WHERE codigo = '76-FALEF' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AVI-02', updated_at = datetime('now') WHERE codigo_manobra = '76-FALEF' AND deleted_at IS NULL;
-- 76-FALRM → S76-AVI-03
UPDATE manobras SET codigo = 'S76-AVI-03', updated_at = datetime('now') WHERE id = 454 AND codigo = '_TMP_454' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AVI-03', updated_at = datetime('now') WHERE codigo = '76-FALRM' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AVI-03', updated_at = datetime('now') WHERE codigo_manobra = '76-FALRM' AND deleted_at IS NULL;
-- 76-PER26 → S76-AVI-04
UPDATE manobras SET codigo = 'S76-AVI-04', updated_at = datetime('now') WHERE id = 453 AND codigo = '_TMP_453' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AVI-04', updated_at = datetime('now') WHERE codigo = '76-PER26' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AVI-04', updated_at = datetime('now') WHERE codigo_manobra = '76-PER26' AND deleted_at IS NULL;
-- 76-PERAT → S76-AVI-05
UPDATE manobras SET codigo = 'S76-AVI-05', updated_at = datetime('now') WHERE id = 452 AND codigo = '_TMP_452' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-AVI-05', updated_at = datetime('now') WHERE codigo = '76-PERAT' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-AVI-05', updated_at = datetime('now') WHERE codigo_manobra = '76-PERAT' AND deleted_at IS NULL;
-- LOFT-NOT-26 → A139-NOT-26
UPDATE manobras SET codigo = 'A139-NOT-26', updated_at = datetime('now') WHERE id = 805 AND codigo = '_TMP_805' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-26', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-26' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-26', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-26' AND deleted_at IS NULL;
-- LOFT-NOT-27 → A139-NOT-27
UPDATE manobras SET codigo = 'A139-NOT-27', updated_at = datetime('now') WHERE id = 806 AND codigo = '_TMP_806' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-27', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-27' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-27', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-27' AND deleted_at IS NULL;
-- LOFT-NOT-28 → A139-NOT-28
UPDATE manobras SET codigo = 'A139-NOT-28', updated_at = datetime('now') WHERE id = 807 AND codigo = '_TMP_807' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-28', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-28' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-28', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-28' AND deleted_at IS NULL;
-- S76-LOFT-28 → S76-NOT-28
UPDATE manobras SET codigo = 'S76-NOT-28', updated_at = datetime('now') WHERE id = 816 AND codigo = '_TMP_816' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-28', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-28' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-28', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-28' AND deleted_at IS NULL;
-- S76-LOFT-29 → S76-NOT-29
UPDATE manobras SET codigo = 'S76-NOT-29', updated_at = datetime('now') WHERE id = 817 AND codigo = '_TMP_817' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-29', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-29' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-29', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-29' AND deleted_at IS NULL;
-- S76-LOFT-30 → S76-NOT-30
UPDATE manobras SET codigo = 'S76-NOT-30', updated_at = datetime('now') WHERE id = 818 AND codigo = '_TMP_818' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-30', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-30' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-30', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-30' AND deleted_at IS NULL;
-- LOFT-CHK-16 → A139-CHK-16
UPDATE manobras SET codigo = 'A139-CHK-16', updated_at = datetime('now') WHERE id = 751 AND codigo = '_TMP_751' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-16', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-16' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-16', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-16' AND deleted_at IS NULL;
-- LOFT-CHK-20 → A139-CHK-20
UPDATE manobras SET codigo = 'A139-CHK-20', updated_at = datetime('now') WHERE id = 755 AND codigo = '_TMP_755' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-20', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-20', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-20' AND deleted_at IS NULL;
-- LOFT-CHK-21 → A139-CHK-21
UPDATE manobras SET codigo = 'A139-CHK-21', updated_at = datetime('now') WHERE id = 756 AND codigo = '_TMP_756' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-21', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-21', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-21' AND deleted_at IS NULL;
-- LOFT-CHK-22 → A139-CHK-22
UPDATE manobras SET codigo = 'A139-CHK-22', updated_at = datetime('now') WHERE id = 757 AND codigo = '_TMP_757' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-22', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-22' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-22', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-22' AND deleted_at IS NULL;
-- LOFT-NOT-20 → A139-CRM-20
UPDATE manobras SET codigo = 'A139-CRM-20', updated_at = datetime('now') WHERE id = 799 AND codigo = '_TMP_799' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CRM-20', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CRM-20', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-20' AND deleted_at IS NULL;
-- LOFT-NOT-21 → A139-CRM-21
UPDATE manobras SET codigo = 'A139-CRM-21', updated_at = datetime('now') WHERE id = 800 AND codigo = '_TMP_800' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CRM-21', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CRM-21', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-21' AND deleted_at IS NULL;
-- LOFT-NOT-22 → A139-CRM-22
UPDATE manobras SET codigo = 'A139-CRM-22', updated_at = datetime('now') WHERE id = 801 AND codigo = '_TMP_801' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CRM-22', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-22' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CRM-22', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-22' AND deleted_at IS NULL;
-- LOFT-OFF-22 → A139-OFF-22
UPDATE manobras SET codigo = 'A139-OFF-22', updated_at = datetime('now') WHERE id = 779 AND codigo = '_TMP_779' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-22', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-22' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-22', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-22' AND deleted_at IS NULL;
-- S76-LOFT-21 → S76-LFT-21
UPDATE manobras SET codigo = 'S76-LFT-21', updated_at = datetime('now') WHERE id = 638 AND codigo = '_TMP_638' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-21', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-21', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-21' AND deleted_at IS NULL;
-- S76-LOFT-22 → S76-LFT-22
UPDATE manobras SET codigo = 'S76-LFT-22', updated_at = datetime('now') WHERE id = 639 AND codigo = '_TMP_639' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-22', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-22' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-22', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-22' AND deleted_at IS NULL;
-- S76-ADC-61 → S76-CRZ-61
UPDATE manobras SET codigo = 'S76-CRZ-61', updated_at = datetime('now') WHERE id = 560 AND codigo = '_TMP_560' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-61', updated_at = datetime('now') WHERE codigo = 'S76-ADC-61' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-61', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ADC-61' AND deleted_at IS NULL;
-- S76-AGB-48 → S76-CRZ-48
UPDATE manobras SET codigo = 'S76-CRZ-48', updated_at = datetime('now') WHERE id = 586 AND codigo = '_TMP_586' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-48', updated_at = datetime('now') WHERE codigo = 'S76-AGB-48' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-48', updated_at = datetime('now') WHERE codigo_manobra = 'S76-AGB-48' AND deleted_at IS NULL;
-- S76-AHR-65 → S76-CRZ-65
UPDATE manobras SET codigo = 'S76-CRZ-65', updated_at = datetime('now') WHERE id = 528 AND codigo = '_TMP_528' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-65', updated_at = datetime('now') WHERE codigo = 'S76-AHR-65' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-65', updated_at = datetime('now') WHERE codigo_manobra = 'S76-AHR-65' AND deleted_at IS NULL;
-- S76-APF-57 → S76-CRZ-57
UPDATE manobras SET codigo = 'S76-CRZ-57', updated_at = datetime('now') WHERE id = 525 AND codigo = '_TMP_525' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-57', updated_at = datetime('now') WHERE codigo = 'S76-APF-57' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-57', updated_at = datetime('now') WHERE codigo_manobra = 'S76-APF-57' AND deleted_at IS NULL;
-- S76-BCS-10 → S76-CRZ-10
UPDATE manobras SET codigo = 'S76-CRZ-10', updated_at = datetime('now') WHERE id = 572 AND codigo = '_TMP_572' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-10', updated_at = datetime('now') WHERE codigo = 'S76-BCS-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-10', updated_at = datetime('now') WHERE codigo_manobra = 'S76-BCS-10' AND deleted_at IS NULL;
-- S76-BTO-53 → S76-CRZ-53
UPDATE manobras SET codigo = 'S76-CRZ-53', updated_at = datetime('now') WHERE id = 558 AND codigo = '_TMP_558' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-53', updated_at = datetime('now') WHERE codigo = 'S76-BTO-53' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-53', updated_at = datetime('now') WHERE codigo_manobra = 'S76-BTO-53' AND deleted_at IS NULL;
-- S76-CCF-10 → S76-CRZ-10A
UPDATE manobras SET codigo = 'S76-CRZ-10A', updated_at = datetime('now') WHERE id = 584 AND codigo = '_TMP_584' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-10A', updated_at = datetime('now') WHERE codigo = 'S76-CCF-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-10A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CCF-10' AND deleted_at IS NULL;
-- S76-CDC-59 → S76-CRZ-59
UPDATE manobras SET codigo = 'S76-CRZ-59', updated_at = datetime('now') WHERE id = 559 AND codigo = '_TMP_559' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-59', updated_at = datetime('now') WHERE codigo = 'S76-CDC-59' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-59', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CDC-59' AND deleted_at IS NULL;
-- S76-CFC-63 → S76-CRZ-63
UPDATE manobras SET codigo = 'S76-CRZ-63', updated_at = datetime('now') WHERE id = 593 AND codigo = '_TMP_593' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-63', updated_at = datetime('now') WHERE codigo = 'S76-CFC-63' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-63', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CFC-63' AND deleted_at IS NULL;
-- S76-CLB-69 → S76-CRZ-69
UPDATE manobras SET codigo = 'S76-CRZ-69', updated_at = datetime('now') WHERE id = 544 AND codigo = '_TMP_544' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-69', updated_at = datetime('now') WHERE codigo = 'S76-CLB-69' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-69', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CLB-69' AND deleted_at IS NULL;
-- S76-CRT-63 → S76-CRZ-63A
UPDATE manobras SET codigo = 'S76-CRZ-63A', updated_at = datetime('now') WHERE id = 561 AND codigo = '_TMP_561' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-63A', updated_at = datetime('now') WHERE codigo = 'S76-CRT-63' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-63A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CRT-63' AND deleted_at IS NULL;
-- S76-CST-00 → S76-CRZ-01
UPDATE manobras SET codigo = 'S76-CRZ-01', updated_at = datetime('now') WHERE id = 503 AND codigo = '_TMP_503' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-01', updated_at = datetime('now') WHERE codigo = 'S76-CST-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CST-00' AND deleted_at IS NULL;
-- S76-DCD-50 → S76-CRZ-50
UPDATE manobras SET codigo = 'S76-CRZ-50', updated_at = datetime('now') WHERE id = 557 AND codigo = '_TMP_557' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-50', updated_at = datetime('now') WHERE codigo = 'S76-DCD-50' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-50', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DCD-50' AND deleted_at IS NULL;
-- S76-DCH-54 → S76-CRZ-54
UPDATE manobras SET codigo = 'S76-CRZ-54', updated_at = datetime('now') WHERE id = 524 AND codigo = '_TMP_524' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-54', updated_at = datetime('now') WHERE codigo = 'S76-DCH-54' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-54', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DCH-54' AND deleted_at IS NULL;
-- S76-DDE-21 → S76-CRZ-21
UPDATE manobras SET codigo = 'S76-CRZ-21', updated_at = datetime('now') WHERE id = 554 AND codigo = '_TMP_554' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-21', updated_at = datetime('now') WHERE codigo = 'S76-DDE-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-21', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DDE-21' AND deleted_at IS NULL;
-- S76-DM1-22 → S76-CRZ-22
UPDATE manobras SET codigo = 'S76-CRZ-22', updated_at = datetime('now') WHERE id = 519 AND codigo = '_TMP_519' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-22', updated_at = datetime('now') WHERE codigo = 'S76-DM1-22' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-22', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DM1-22' AND deleted_at IS NULL;
-- S76-DMB-24 → S76-CRZ-24
UPDATE manobras SET codigo = 'S76-CRZ-24', updated_at = datetime('now') WHERE id = 585 AND codigo = '_TMP_585' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-24', updated_at = datetime('now') WHERE codigo = 'S76-DMB-24' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-24', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DMB-24' AND deleted_at IS NULL;
-- S76-DMN-21 → S76-CRZ-21A
UPDATE manobras SET codigo = 'S76-CRZ-21A', updated_at = datetime('now') WHERE id = 520 AND codigo = '_TMP_520' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-21A', updated_at = datetime('now') WHERE codigo = 'S76-DMN-21' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-21A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DMN-21' AND deleted_at IS NULL;
-- S76-DOP-69 → S76-CRZ-69A
UPDATE manobras SET codigo = 'S76-CRZ-69A', updated_at = datetime('now') WHERE id = 545 AND codigo = '_TMP_545' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-69A', updated_at = datetime('now') WHERE codigo = 'S76-DOP-69' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-69A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DOP-69' AND deleted_at IS NULL;
-- S76-EAI-55 → S76-CRZ-55
UPDATE manobras SET codigo = 'S76-CRZ-55', updated_at = datetime('now') WHERE id = 588 AND codigo = '_TMP_588' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-55', updated_at = datetime('now') WHERE codigo = 'S76-EAI-55' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-55', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EAI-55' AND deleted_at IS NULL;
-- S76-EBV-54 → S76-CRZ-54A
UPDATE manobras SET codigo = 'S76-CRZ-54A', updated_at = datetime('now') WHERE id = 587 AND codigo = '_TMP_587' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-54A', updated_at = datetime('now') WHERE codigo = 'S76-EBV-54' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-54A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EBV-54' AND deleted_at IS NULL;
-- S76-ECH-26 → S76-CRZ-26
UPDATE manobras SET codigo = 'S76-CRZ-26', updated_at = datetime('now') WHERE id = 555 AND codigo = '_TMP_555' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-26', updated_at = datetime('now') WHERE codigo = 'S76-ECH-26' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-26', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ECH-26' AND deleted_at IS NULL;
-- S76-ECO-20 → S76-CRZ-20
UPDATE manobras SET codigo = 'S76-CRZ-20', updated_at = datetime('now') WHERE id = 553 AND codigo = '_TMP_553' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-20', updated_at = datetime('now') WHERE codigo = 'S76-ECO-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-20', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ECO-20' AND deleted_at IS NULL;
-- S76-EFI-12 → S76-CRZ-12
UPDATE manobras SET codigo = 'S76-CRZ-12', updated_at = datetime('now') WHERE id = 562 AND codigo = '_TMP_562' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-12', updated_at = datetime('now') WHERE codigo = 'S76-EFI-12' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-12', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EFI-12' AND deleted_at IS NULL;
-- S76-EOP-25 → S76-CRZ-25
UPDATE manobras SET codigo = 'S76-CRZ-25', updated_at = datetime('now') WHERE id = 522 AND codigo = '_TMP_522' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-25', updated_at = datetime('now') WHERE codigo = 'S76-EOP-25' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-25', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EOP-25' AND deleted_at IS NULL;
-- S76-EOT-25 → S76-CRZ-25A
UPDATE manobras SET codigo = 'S76-CRZ-25A', updated_at = datetime('now') WHERE id = 575 AND codigo = '_TMP_575' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-25A', updated_at = datetime('now') WHERE codigo = 'S76-EOT-25' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-25A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EOT-25' AND deleted_at IS NULL;
-- S76-ERF-18 → S76-CRZ-18
UPDATE manobras SET codigo = 'S76-CRZ-18', updated_at = datetime('now') WHERE id = 574 AND codigo = '_TMP_574' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-18', updated_at = datetime('now') WHERE codigo = 'S76-ERF-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-18', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ERF-18' AND deleted_at IS NULL;
-- S76-ESF-18 → S76-CRZ-18A
UPDATE manobras SET codigo = 'S76-CRZ-18A', updated_at = datetime('now') WHERE id = 573 AND codigo = '_TMP_573' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-18A', updated_at = datetime('now') WHERE codigo = 'S76-ESF-18' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-18A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ESF-18' AND deleted_at IS NULL;
-- S76-FCR-17 → S76-CRZ-17
UPDATE manobras SET codigo = 'S76-CRZ-17', updated_at = datetime('now') WHERE id = 518 AND codigo = '_TMP_518' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-17', updated_at = datetime('now') WHERE codigo = 'S76-FCR-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-17', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FCR-17' AND deleted_at IS NULL;
-- S76-FDF-60 → S76-CRZ-60
UPDATE manobras SET codigo = 'S76-CRZ-60', updated_at = datetime('now') WHERE id = 527 AND codigo = '_TMP_527' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-60', updated_at = datetime('now') WHERE codigo = 'S76-FDF-60' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-60', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FDF-60' AND deleted_at IS NULL;
-- S76-FFL-32 → S76-CRZ-32
UPDATE manobras SET codigo = 'S76-CRZ-32', updated_at = datetime('now') WHERE id = 507 AND codigo = '_TMP_507' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-32', updated_at = datetime('now') WHERE codigo = 'S76-FFL-32' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-32', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FFL-32' AND deleted_at IS NULL;
-- S76-FFM-32 → S76-CRZ-32A
UPDATE manobras SET codigo = 'S76-CRZ-32A', updated_at = datetime('now') WHERE id = 508 AND codigo = '_TMP_508' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-32A', updated_at = datetime('now') WHERE codigo = 'S76-FFM-32' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-32A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FFM-32' AND deleted_at IS NULL;
-- S76-FMF-07 → S76-CRZ-07
UPDATE manobras SET codigo = 'S76-CRZ-07', updated_at = datetime('now') WHERE id = 536 AND codigo = '_TMP_536' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-07', updated_at = datetime('now') WHERE codigo = 'S76-FMF-07' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-07', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMF-07' AND deleted_at IS NULL;
-- S76-FPL-31 → S76-CRZ-31
UPDATE manobras SET codigo = 'S76-CRZ-31', updated_at = datetime('now') WHERE id = 538 AND codigo = '_TMP_538' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-31', updated_at = datetime('now') WHERE codigo = 'S76-FPL-31' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-31', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FPL-31' AND deleted_at IS NULL;
-- S76-HOM-59 → S76-CRZ-59A
UPDATE manobras SET codigo = 'S76-CRZ-59A', updated_at = datetime('now') WHERE id = 589 AND codigo = '_TMP_589' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-59A', updated_at = datetime('now') WHERE codigo = 'S76-HOM-59' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-59A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HOM-59' AND deleted_at IS NULL;
-- S76-IGB-37 → S76-CRZ-37
UPDATE manobras SET codigo = 'S76-CRZ-37', updated_at = datetime('now') WHERE id = 578 AND codigo = '_TMP_578' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-37', updated_at = datetime('now') WHERE codigo = 'S76-IGB-37' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-37', updated_at = datetime('now') WHERE codigo_manobra = 'S76-IGB-37' AND deleted_at IS NULL;
-- S76-IID-62 → S76-CRZ-62
UPDATE manobras SET codigo = 'S76-CRZ-62', updated_at = datetime('now') WHERE id = 591 AND codigo = '_TMP_591' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-62', updated_at = datetime('now') WHERE codigo = 'S76-IID-62' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-62', updated_at = datetime('now') WHERE codigo_manobra = 'S76-IID-62' AND deleted_at IS NULL;
-- S76-LOW-32 → S76-CRZ-32B
UPDATE manobras SET codigo = 'S76-CRZ-32B', updated_at = datetime('now') WHERE id = 539 AND codigo = '_TMP_539' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-32B', updated_at = datetime('now') WHERE codigo = 'S76-LOW-32' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-32B', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOW-32' AND deleted_at IS NULL;
-- S76-MBF-61 → S76-CRZ-61A
UPDATE manobras SET codigo = 'S76-CRZ-61A', updated_at = datetime('now') WHERE id = 590 AND codigo = '_TMP_590' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-61A', updated_at = datetime('now') WHERE codigo = 'S76-MBF-61' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-61A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MBF-61' AND deleted_at IS NULL;
-- S76-MGC-36 → S76-CRZ-36
UPDATE manobras SET codigo = 'S76-CRZ-36', updated_at = datetime('now') WHERE id = 541 AND codigo = '_TMP_541' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-36', updated_at = datetime('now') WHERE codigo = 'S76-MGC-36' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-36', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MGC-36' AND deleted_at IS NULL;
-- S76-MGL-33 → S76-CRZ-33
UPDATE manobras SET codigo = 'S76-CRZ-33', updated_at = datetime('now') WHERE id = 540 AND codigo = '_TMP_540' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-33', updated_at = datetime('now') WHERE codigo = 'S76-MGL-33' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-33', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MGL-33' AND deleted_at IS NULL;
-- S76-MGP-33 → S76-CRZ-33A
UPDATE manobras SET codigo = 'S76-CRZ-33A', updated_at = datetime('now') WHERE id = 505 AND codigo = '_TMP_505' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-33A', updated_at = datetime('now') WHERE codigo = 'S76-MGP-33' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-33A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MGP-33' AND deleted_at IS NULL;
-- S76-MOH-35 → S76-CRZ-35
UPDATE manobras SET codigo = 'S76-CRZ-35', updated_at = datetime('now') WHERE id = 577 AND codigo = '_TMP_577' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-35', updated_at = datetime('now') WHERE codigo = 'S76-MOH-35' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-35', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MOH-35' AND deleted_at IS NULL;
-- S76-MRV-00 → S76-CRZ-02
UPDATE manobras SET codigo = 'S76-CRZ-02', updated_at = datetime('now') WHERE id = 504 AND codigo = '_TMP_504' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-02', updated_at = datetime('now') WHERE codigo = 'S76-MRV-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MRV-00' AND deleted_at IS NULL;
-- S76-N1T-30 → S76-CRZ-30
UPDATE manobras SET codigo = 'S76-CRZ-30', updated_at = datetime('now') WHERE id = 521 AND codigo = '_TMP_521' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-30', updated_at = datetime('now') WHERE codigo = 'S76-N1T-30' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-30', updated_at = datetime('now') WHERE codigo_manobra = 'S76-N1T-30' AND deleted_at IS NULL;
-- S76-OFL-30 → S76-CRZ-30A
UPDATE manobras SET codigo = 'S76-CRZ-30A', updated_at = datetime('now') WHERE id = 576 AND codigo = '_TMP_576' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-30A', updated_at = datetime('now') WHERE codigo = 'S76-OFL-30' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-30A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-OFL-30' AND deleted_at IS NULL;
-- S76-SDC-50 → S76-CRZ-50A
UPDATE manobras SET codigo = 'S76-CRZ-50A', updated_at = datetime('now') WHERE id = 523 AND codigo = '_TMP_523' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-50A', updated_at = datetime('now') WHERE codigo = 'S76-SDC-50' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-50A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SDC-50' AND deleted_at IS NULL;
-- S76-SFE-10 → S76-CRZ-10B
UPDATE manobras SET codigo = 'S76-CRZ-10B', updated_at = datetime('now') WHERE id = 571 AND codigo = '_TMP_571' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-10B', updated_at = datetime('now') WHERE codigo = 'S76-SFE-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-10B', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SFE-10' AND deleted_at IS NULL;
-- S76-SGA-62 → S76-CRZ-62A
UPDATE manobras SET codigo = 'S76-CRZ-62A', updated_at = datetime('now') WHERE id = 592 AND codigo = '_TMP_592' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-62A', updated_at = datetime('now') WHERE codigo = 'S76-SGA-62' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-62A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SGA-62' AND deleted_at IS NULL;
-- S76-SS2-43 → S76-CRZ-43
UPDATE manobras SET codigo = 'S76-CRZ-43', updated_at = datetime('now') WHERE id = 543 AND codigo = '_TMP_543' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-43', updated_at = datetime('now') WHERE codigo = 'S76-SS2-43' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-43', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SS2-43' AND deleted_at IS NULL;
-- S76-SSS-42 → S76-CRZ-42
UPDATE manobras SET codigo = 'S76-CRZ-42', updated_at = datetime('now') WHERE id = 506 AND codigo = '_TMP_506' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-42', updated_at = datetime('now') WHERE codigo = 'S76-SSS-42' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-42', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SSS-42' AND deleted_at IS NULL;
-- S76-T5I-31 → S76-CRZ-31A
UPDATE manobras SET codigo = 'S76-CRZ-31A', updated_at = datetime('now') WHERE id = 556 AND codigo = '_TMP_556' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-31A', updated_at = datetime('now') WHERE codigo = 'S76-T5I-31' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-31A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-T5I-31' AND deleted_at IS NULL;
-- S76-TCS-39 → S76-CRZ-39
UPDATE manobras SET codigo = 'S76-CRZ-39', updated_at = datetime('now') WHERE id = 579 AND codigo = '_TMP_579' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-39', updated_at = datetime('now') WHERE codigo = 'S76-TCS-39' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-39', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TCS-39' AND deleted_at IS NULL;
-- S76-TDM-41 → S76-CRZ-41
UPDATE manobras SET codigo = 'S76-CRZ-41', updated_at = datetime('now') WHERE id = 580 AND codigo = '_TMP_580' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-41', updated_at = datetime('now') WHERE codigo = 'S76-TDM-41' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-41', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TDM-41' AND deleted_at IS NULL;
-- S76-TRD-39 → S76-CRZ-39A
UPDATE manobras SET codigo = 'S76-CRZ-39A', updated_at = datetime('now') WHERE id = 542 AND codigo = '_TMP_542' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-39A', updated_at = datetime('now') WHERE codigo = 'S76-TRD-39' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-39A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TRD-39' AND deleted_at IS NULL;
-- S76-TRM-58 → S76-CRZ-58
UPDATE manobras SET codigo = 'S76-CRZ-58', updated_at = datetime('now') WHERE id = 526 AND codigo = '_TMP_526' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-58', updated_at = datetime('now') WHERE codigo = 'S76-TRM-58' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-58', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TRM-58' AND deleted_at IS NULL;
-- S76-UAR-00 → S76-CRZ-03
UPDATE manobras SET codigo = 'S76-CRZ-03', updated_at = datetime('now') WHERE id = 594 AND codigo = '_TMP_594' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-03', updated_at = datetime('now') WHERE codigo = 'S76-UAR-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-UAR-00' AND deleted_at IS NULL;
-- S76-XFD-20 → S76-CRZ-20A
UPDATE manobras SET codigo = 'S76-CRZ-20A', updated_at = datetime('now') WHERE id = 537 AND codigo = '_TMP_537' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-CRZ-20A', updated_at = datetime('now') WHERE codigo = 'S76-XFD-20' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-CRZ-20A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-XFD-20' AND deleted_at IS NULL;
-- S76-LOFT-25 → S76-NOT-25
UPDATE manobras SET codigo = 'S76-NOT-25', updated_at = datetime('now') WHERE id = 813 AND codigo = '_TMP_813' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-25', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-25' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-25', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-25' AND deleted_at IS NULL;
-- S76-CGI-00 → S76-DEC-03
UPDATE manobras SET codigo = 'S76-DEC-03', updated_at = datetime('now') WHERE id = 516 AND codigo = '_TMP_516' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DEC-03', updated_at = datetime('now') WHERE codigo = 'S76-CGI-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DEC-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CGI-00' AND deleted_at IS NULL;
-- S76-FDA-00 → S76-DEC-02
UPDATE manobras SET codigo = 'S76-DEC-02', updated_at = datetime('now') WHERE id = 515 AND codigo = '_TMP_515' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DEC-02', updated_at = datetime('now') WHERE codigo = 'S76-FDA-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DEC-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FDA-00' AND deleted_at IS NULL;
-- S76-FMA-14 → S76-DEC-14
UPDATE manobras SET codigo = 'S76-DEC-14', updated_at = datetime('now') WHERE id = 499 AND codigo = '_TMP_499' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DEC-14', updated_at = datetime('now') WHERE codigo = 'S76-FMA-14' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DEC-14', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMA-14' AND deleted_at IS NULL;
-- S76-FMC-15 → S76-DEC-15
UPDATE manobras SET codigo = 'S76-DEC-15', updated_at = datetime('now') WHERE id = 500 AND codigo = '_TMP_500' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DEC-15', updated_at = datetime('now') WHERE codigo = 'S76-FMC-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DEC-15', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMC-15' AND deleted_at IS NULL;
-- S76-TDP-00 → S76-DEC-01
UPDATE manobras SET codigo = 'S76-DEC-01', updated_at = datetime('now') WHERE id = 498 AND codigo = '_TMP_498' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DEC-01', updated_at = datetime('now') WHERE codigo = 'S76-TDP-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DEC-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TDP-00' AND deleted_at IS NULL;
-- S76-HLD-00 → S76-DSC-01
UPDATE manobras SET codigo = 'S76-DSC-01', updated_at = datetime('now') WHERE id = 529 AND codigo = '_TMP_529' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-DSC-01', updated_at = datetime('now') WHERE codigo = 'S76-HLD-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-DSC-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HLD-00' AND deleted_at IS NULL;
-- 76-FALEB → S76-ELE-01
UPDATE manobras SET codigo = 'S76-ELE-01', updated_at = datetime('now') WHERE id = 459 AND codigo = '_TMP_459' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-01', updated_at = datetime('now') WHERE codigo = '76-FALEB' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-01', updated_at = datetime('now') WHERE codigo_manobra = '76-FALEB' AND deleted_at IS NULL;
-- 76-FALFF → S76-ELE-02
UPDATE manobras SET codigo = 'S76-ELE-02', updated_at = datetime('now') WHERE id = 461 AND codigo = '_TMP_461' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-02', updated_at = datetime('now') WHERE codigo = '76-FALFF' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-02', updated_at = datetime('now') WHERE codigo_manobra = '76-FALFF' AND deleted_at IS NULL;
-- 76-FALGA → S76-ELE-03
UPDATE manobras SET codigo = 'S76-ELE-03', updated_at = datetime('now') WHERE id = 458 AND codigo = '_TMP_458' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-03', updated_at = datetime('now') WHERE codigo = '76-FALGA' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-03', updated_at = datetime('now') WHERE codigo_manobra = '76-FALGA' AND deleted_at IS NULL;
-- 76-FALGC → S76-ELE-04
UPDATE manobras SET codigo = 'S76-ELE-04', updated_at = datetime('now') WHERE id = 455 AND codigo = '_TMP_455' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-04', updated_at = datetime('now') WHERE codigo = '76-FALGC' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-04', updated_at = datetime('now') WHERE codigo_manobra = '76-FALGC' AND deleted_at IS NULL;
-- 76-FALGD → S76-ELE-05
UPDATE manobras SET codigo = 'S76-ELE-05', updated_at = datetime('now') WHERE id = 456 AND codigo = '_TMP_456' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-05', updated_at = datetime('now') WHERE codigo = '76-FALGD' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-05', updated_at = datetime('now') WHERE codigo_manobra = '76-FALGD' AND deleted_at IS NULL;
-- 76-FALIV → S76-ELE-06
UPDATE manobras SET codigo = 'S76-ELE-06', updated_at = datetime('now') WHERE id = 460 AND codigo = '_TMP_460' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-06', updated_at = datetime('now') WHERE codigo = '76-FALIV' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-06', updated_at = datetime('now') WHERE codigo_manobra = '76-FALIV' AND deleted_at IS NULL;
-- 76-SOBGD → S76-ELE-07
UPDATE manobras SET codigo = 'S76-ELE-07', updated_at = datetime('now') WHERE id = 457 AND codigo = '_TMP_457' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-ELE-07', updated_at = datetime('now') WHERE codigo = '76-SOBGD' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-ELE-07', updated_at = datetime('now') WHERE codigo_manobra = '76-SOBGD' AND deleted_at IS NULL;
-- LOFT-CHK-08 → A139-CHK-08
UPDATE manobras SET codigo = 'A139-CHK-08', updated_at = datetime('now') WHERE id = 743 AND codigo = '_TMP_743' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-08', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-08' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-08', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-08' AND deleted_at IS NULL;
-- LOFT-CHK-11 → A139-CHK-11
UPDATE manobras SET codigo = 'A139-CHK-11', updated_at = datetime('now') WHERE id = 746 AND codigo = '_TMP_746' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-11', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-11' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-11', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-11' AND deleted_at IS NULL;
-- LOFT-NOT-12 → A139-EME-12
UPDATE manobras SET codigo = 'A139-EME-12', updated_at = datetime('now') WHERE id = 791 AND codigo = '_TMP_791' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-12', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-12' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-12', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-12' AND deleted_at IS NULL;
-- LOFT-NOT-13 → A139-EME-13
UPDATE manobras SET codigo = 'A139-EME-13', updated_at = datetime('now') WHERE id = 792 AND codigo = '_TMP_792' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-13', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-13' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-13', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-13' AND deleted_at IS NULL;
-- LOFT-NOT-14 → A139-EME-14
UPDATE manobras SET codigo = 'A139-EME-14', updated_at = datetime('now') WHERE id = 793 AND codigo = '_TMP_793' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-14', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-14' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-14', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-14' AND deleted_at IS NULL;
-- LOFT-OFF-11 → A139-OFF-11
UPDATE manobras SET codigo = 'A139-OFF-11', updated_at = datetime('now') WHERE id = 768 AND codigo = '_TMP_768' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-11', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-11' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-11', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-11' AND deleted_at IS NULL;
-- LOFT-OFF-12 → A139-OFF-12
UPDATE manobras SET codigo = 'A139-OFF-12', updated_at = datetime('now') WHERE id = 769 AND codigo = '_TMP_769' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-12', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-12' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-12', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-12' AND deleted_at IS NULL;
-- LOFT-OFF-13 → A139-OFF-13
UPDATE manobras SET codigo = 'A139-OFF-13', updated_at = datetime('now') WHERE id = 770 AND codigo = '_TMP_770' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-13', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-13' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-13', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-13' AND deleted_at IS NULL;
-- LOFT-OFF-16 → A139-OFF-16
UPDATE manobras SET codigo = 'A139-OFF-16', updated_at = datetime('now') WHERE id = 773 AND codigo = '_TMP_773' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-16', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-16' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-16', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-16' AND deleted_at IS NULL;
-- S76-LOFT-13 → S76-LFT-13
UPDATE manobras SET codigo = 'S76-LFT-13', updated_at = datetime('now') WHERE id = 630 AND codigo = '_TMP_630' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-13', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-13' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-13', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-13' AND deleted_at IS NULL;
-- S76-LOFT-14 → S76-LFT-14
UPDATE manobras SET codigo = 'S76-LFT-14', updated_at = datetime('now') WHERE id = 631 AND codigo = '_TMP_631' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-14', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-14' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-14', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-14' AND deleted_at IS NULL;
-- S76-LOFT-15 → S76-LFT-15
UPDATE manobras SET codigo = 'S76-LFT-15', updated_at = datetime('now') WHERE id = 632 AND codigo = '_TMP_632' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-15', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-15', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-15' AND deleted_at IS NULL;
-- S76-LOFT-16 → S76-LFT-16
UPDATE manobras SET codigo = 'S76-LFT-16', updated_at = datetime('now') WHERE id = 633 AND codigo = '_TMP_633' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-16', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-16' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-16', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-16' AND deleted_at IS NULL;
-- S76-LOFT-17 → S76-LFT-17
UPDATE manobras SET codigo = 'S76-LFT-17', updated_at = datetime('now') WHERE id = 634 AND codigo = '_TMP_634' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-17', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-17', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-17' AND deleted_at IS NULL;
-- A139-AUT-02 → A139-EME-02
UPDATE manobras SET codigo = 'A139-EME-02', updated_at = datetime('now') WHERE id = 893 AND codigo = '_TMP_893' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-02', updated_at = datetime('now') WHERE codigo = 'A139-AUT-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-02', updated_at = datetime('now') WHERE codigo_manobra = 'A139-AUT-02' AND deleted_at IS NULL;
-- A139-OEI-01 → A139-EME-01
UPDATE manobras SET codigo = 'A139-EME-01', updated_at = datetime('now') WHERE id = 913 AND codigo = '_TMP_913' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-01', updated_at = datetime('now') WHERE codigo = 'A139-OEI-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-01', updated_at = datetime('now') WHERE codigo_manobra = 'A139-OEI-01' AND deleted_at IS NULL;
-- A139-RPM-02 → A139-EME-02A
UPDATE manobras SET codigo = 'A139-EME-02A', updated_at = datetime('now') WHERE id = 922 AND codigo = '_TMP_922' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-02A', updated_at = datetime('now') WHERE codigo = 'A139-RPM-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-02A', updated_at = datetime('now') WHERE codigo_manobra = 'A139-RPM-02' AND deleted_at IS NULL;
-- INV-AUT-01 → EME-01
UPDATE manobras SET codigo = 'EME-01', updated_at = datetime('now') WHERE id = 989 AND codigo = '_TMP_989' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'EME-01', updated_at = datetime('now') WHERE codigo = 'INV-AUT-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'EME-01', updated_at = datetime('now') WHERE codigo_manobra = 'INV-AUT-01' AND deleted_at IS NULL;
-- S76-OEI-01 → S76-EME-01
UPDATE manobras SET codigo = 'S76-EME-01', updated_at = datetime('now') WHERE id = 958 AND codigo = '_TMP_958' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-EME-01', updated_at = datetime('now') WHERE codigo = 'S76-OEI-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-EME-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-OEI-01' AND deleted_at IS NULL;
-- LOFT-NOT-30 → A139-EME-30
UPDATE manobras SET codigo = 'A139-EME-30', updated_at = datetime('now') WHERE id = 809 AND codigo = '_TMP_809' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-30', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-30' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-30', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-30' AND deleted_at IS NULL;
-- LOFT-NOT-31 → A139-EME-31
UPDATE manobras SET codigo = 'A139-EME-31', updated_at = datetime('now') WHERE id = 810 AND codigo = '_TMP_810' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-EME-31', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-31' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-EME-31', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-31' AND deleted_at IS NULL;
-- S76-LOFT-32 → S76-NOT-32
UPDATE manobras SET codigo = 'S76-NOT-32', updated_at = datetime('now') WHERE id = 820 AND codigo = '_TMP_820' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-32', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-32' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-32', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-32' AND deleted_at IS NULL;
-- S76-LOFT-33 → S76-LFT-33
UPDATE manobras SET codigo = 'S76-LFT-33', updated_at = datetime('now') WHERE id = 821 AND codigo = '_TMP_821' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-33', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-33' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-33', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-33' AND deleted_at IS NULL;
-- S76-LOFT-34 → S76-OFF-34
UPDATE manobras SET codigo = 'S76-OFF-34', updated_at = datetime('now') WHERE id = 822 AND codigo = '_TMP_822' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-OFF-34', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-34' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-OFF-34', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-34' AND deleted_at IS NULL;
-- S76-FMH-13 → S76-HOV-13
UPDATE manobras SET codigo = 'S76-HOV-13', updated_at = datetime('now') WHERE id = 496 AND codigo = '_TMP_496' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-HOV-13', updated_at = datetime('now') WHERE codigo = 'S76-FMH-13' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-HOV-13', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMH-13' AND deleted_at IS NULL;
-- S76-HOV-00 → S76-HOV-01
UPDATE manobras SET codigo = 'S76-HOV-01', updated_at = datetime('now') WHERE id = 495 AND codigo = '_TMP_495' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-HOV-01', updated_at = datetime('now') WHERE codigo = 'S76-HOV-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-HOV-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HOV-00' AND deleted_at IS NULL;
-- S76-TRH-38 → S76-HOV-38
UPDATE manobras SET codigo = 'S76-HOV-38', updated_at = datetime('now') WHERE id = 497 AND codigo = '_TMP_497' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-HOV-38', updated_at = datetime('now') WHERE codigo = 'S76-TRH-38' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-HOV-38', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TRH-38' AND deleted_at IS NULL;
-- LOFT-CHK-23 → A139-CHK-23
UPDATE manobras SET codigo = 'A139-CHK-23', updated_at = datetime('now') WHERE id = 930 AND codigo = '_TMP_930' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-23', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-23' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-23', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-23' AND deleted_at IS NULL;
-- S76-NDL-00 → S76-NTR-01
UPDATE manobras SET codigo = 'S76-NTR-01', updated_at = datetime('now') WHERE id = 550 AND codigo = '_TMP_550' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NTR-01', updated_at = datetime('now') WHERE codigo = 'S76-NDL-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NTR-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NDL-00' AND deleted_at IS NULL;
-- LOFT-NOT-23 → A139-SOL-23
UPDATE manobras SET codigo = 'A139-SOL-23', updated_at = datetime('now') WHERE id = 802 AND codigo = '_TMP_802' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-SOL-23', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-23' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-SOL-23', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-23' AND deleted_at IS NULL;
-- S76-LOFT-24 → S76-NOT-24
UPDATE manobras SET codigo = 'S76-NOT-24', updated_at = datetime('now') WHERE id = 812 AND codigo = '_TMP_812' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-24', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-24' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-24', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-24' AND deleted_at IS NULL;
-- S76-LOFT-26 → S76-NOT-26
UPDATE manobras SET codigo = 'S76-NOT-26', updated_at = datetime('now') WHERE id = 814 AND codigo = '_TMP_814' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-26', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-26' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-26', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-26' AND deleted_at IS NULL;
-- S76-NDT-00 → S76-SOL-01
UPDATE manobras SET codigo = 'S76-SOL-01', updated_at = datetime('now') WHERE id = 830 AND codigo = '_TMP_830' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-01', updated_at = datetime('now') WHERE codigo = 'S76-NDT-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NDT-00' AND deleted_at IS NULL;
-- S76-HNG-00 → S76-PAR-03
UPDATE manobras SET codigo = 'S76-PAR-03', updated_at = datetime('now') WHERE id = 534 AND codigo = '_TMP_534' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PAR-03', updated_at = datetime('now') WHERE codigo = 'S76-HNG-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PAR-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HNG-00' AND deleted_at IS NULL;
-- S76-HOT-00 → S76-PAR-01
UPDATE manobras SET codigo = 'S76-PAR-01', updated_at = datetime('now') WHERE id = 491 AND codigo = '_TMP_491' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PAR-01', updated_at = datetime('now') WHERE codigo = 'S76-HOT-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PAR-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HOT-00' AND deleted_at IS NULL;
-- S76-STF-00 → S76-PAR-02
UPDATE manobras SET codigo = 'S76-PAR-02', updated_at = datetime('now') WHERE id = 492 AND codigo = '_TMP_492' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PAR-02', updated_at = datetime('now') WHERE codigo = 'S76-STF-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PAR-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-STF-00' AND deleted_at IS NULL;
-- A139-PNO-01 → A139-POU-01
UPDATE manobras SET codigo = 'A139-POU-01', updated_at = datetime('now') WHERE id = 915 AND codigo = '_TMP_915' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-POU-01', updated_at = datetime('now') WHERE codigo = 'A139-PNO-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-POU-01', updated_at = datetime('now') WHERE codigo_manobra = 'A139-PNO-01' AND deleted_at IS NULL;
-- A139-POU-01 → A139-POU-01A
UPDATE manobras SET codigo = 'A139-POU-01A', updated_at = datetime('now') WHERE id = 916 AND codigo = '_TMP_916' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-POU-01A', updated_at = datetime('now') WHERE codigo = 'A139-POU-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-POU-01A', updated_at = datetime('now') WHERE codigo_manobra = 'A139-POU-01' AND deleted_at IS NULL;
-- S76-APO-01 → S76-POU-01
UPDATE manobras SET codigo = 'S76-POU-01', updated_at = datetime('now') WHERE id = 934 AND codigo = '_TMP_934' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-01', updated_at = datetime('now') WHERE codigo = 'S76-APO-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-APO-01' AND deleted_at IS NULL;
-- S76-ARO-01 → S76-POU-01A
UPDATE manobras SET codigo = 'S76-POU-01A', updated_at = datetime('now') WHERE id = 937 AND codigo = '_TMP_937' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-01A', updated_at = datetime('now') WHERE codigo = 'S76-ARO-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-01A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ARO-01' AND deleted_at IS NULL;
-- S76-AUT-70 → S76-POU-70
UPDATE manobras SET codigo = 'S76-POU-70', updated_at = datetime('now') WHERE id = 510 AND codigo = '_TMP_510' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-70', updated_at = datetime('now') WHERE codigo = 'S76-AUT-70' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-70', updated_at = datetime('now') WHERE codigo_manobra = 'S76-AUT-70' AND deleted_at IS NULL;
-- S76-ILS-00 → S76-POU-02A
UPDATE manobras SET codigo = 'S76-POU-02A', updated_at = datetime('now') WHERE id = 532 AND codigo = '_TMP_532' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-02A', updated_at = datetime('now') WHERE codigo = 'S76-ILS-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-02A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ILS-00' AND deleted_at IS NULL;
-- S76-LDP-00 → S76-POU-01B
UPDATE manobras SET codigo = 'S76-POU-01B', updated_at = datetime('now') WHERE id = 511 AND codigo = '_TMP_511' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-01B', updated_at = datetime('now') WHERE codigo = 'S76-LDP-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-01B', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LDP-00' AND deleted_at IS NULL;
-- S76-MIS-00 → S76-POU-03
UPDATE manobras SET codigo = 'S76-POU-03', updated_at = datetime('now') WHERE id = 533 AND codigo = '_TMP_533' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-03', updated_at = datetime('now') WHERE codigo = 'S76-MIS-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-MIS-00' AND deleted_at IS NULL;
-- S76-RBL-37 → S76-POU-37
UPDATE manobras SET codigo = 'S76-POU-37', updated_at = datetime('now') WHERE id = 549 AND codigo = '_TMP_549' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-37', updated_at = datetime('now') WHERE codigo = 'S76-RBL-37' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-37', updated_at = datetime('now') WHERE codigo_manobra = 'S76-RBL-37' AND deleted_at IS NULL;
-- S76-RNV-00 → S76-POU-04
UPDATE manobras SET codigo = 'S76-POU-04', updated_at = datetime('now') WHERE id = 565 AND codigo = '_TMP_565' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-04', updated_at = datetime('now') WHERE codigo = 'S76-RNV-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-04', updated_at = datetime('now') WHERE codigo_manobra = 'S76-RNV-00' AND deleted_at IS NULL;
-- S76-SGA-15 → S76-POU-15
UPDATE manobras SET codigo = 'S76-POU-15', updated_at = datetime('now') WHERE id = 566 AND codigo = '_TMP_566' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-15', updated_at = datetime('now') WHERE codigo = 'S76-SGA-15' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-15', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SGA-15' AND deleted_at IS NULL;
-- S76-VOR-00 → S76-POU-05
UPDATE manobras SET codigo = 'S76-POU-05', updated_at = datetime('now') WHERE id = 595 AND codigo = '_TMP_595' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-POU-05', updated_at = datetime('now') WHERE codigo = 'S76-VOR-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-POU-05', updated_at = datetime('now') WHERE codigo_manobra = 'S76-VOR-00' AND deleted_at IS NULL;
-- 76-COMBX → S76-PWP-01
UPDATE manobras SET codigo = 'S76-PWP-01', updated_at = datetime('now') WHERE id = 475 AND codigo = '_TMP_475' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-01', updated_at = datetime('now') WHERE codigo = '76-COMBX' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-01', updated_at = datetime('now') WHERE codigo_manobra = '76-COMBX' AND deleted_at IS NULL;
-- 76-DCU1M → S76-PWP-02
UPDATE manobras SET codigo = 'S76-PWP-02', updated_at = datetime('now') WHERE id = 464 AND codigo = '_TMP_464' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-02', updated_at = datetime('now') WHERE codigo = '76-DCU1M' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-02', updated_at = datetime('now') WHERE codigo_manobra = '76-DCU1M' AND deleted_at IS NULL;
-- 76-DCU2M → S76-PWP-03
UPDATE manobras SET codigo = 'S76-PWP-03', updated_at = datetime('now') WHERE id = 465 AND codigo = '_TMP_465' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-03', updated_at = datetime('now') WHERE codigo = '76-DCU2M' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-03', updated_at = datetime('now') WHERE codigo_manobra = '76-DCU2M' AND deleted_at IS NULL;
-- 76-DCUDG → S76-PWP-04
UPDATE manobras SET codigo = 'S76-PWP-04', updated_at = datetime('now') WHERE id = 463 AND codigo = '_TMP_463' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-04', updated_at = datetime('now') WHERE codigo = '76-DCUDG' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-04', updated_at = datetime('now') WHERE codigo_manobra = '76-DCUDG' AND deleted_at IS NULL;
-- 76-DCUMN → S76-PWP-05
UPDATE manobras SET codigo = 'S76-PWP-05', updated_at = datetime('now') WHERE id = 462 AND codigo = '_TMP_462' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-05', updated_at = datetime('now') WHERE codigo = '76-DCUMN' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-05', updated_at = datetime('now') WHERE codigo_manobra = '76-DCUMN' AND deleted_at IS NULL;
-- 76-DUACZ → S76-PWP-06
UPDATE manobras SET codigo = 'S76-PWP-06', updated_at = datetime('now') WHERE id = 473 AND codigo = '_TMP_473' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-06', updated_at = datetime('now') WHERE codigo = '76-DUACZ' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-06', updated_at = datetime('now') WHERE codigo_manobra = '76-DUACZ' AND deleted_at IS NULL;
-- 76-DUADC → S76-PWP-07
UPDATE manobras SET codigo = 'S76-PWP-07', updated_at = datetime('now') WHERE id = 472 AND codigo = '_TMP_472' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-07', updated_at = datetime('now') WHERE codigo = '76-DUADC' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-07', updated_at = datetime('now') WHERE codigo_manobra = '76-DUADC' AND deleted_at IS NULL;
-- 76-DUAHV → S76-PWP-08
UPDATE manobras SET codigo = 'S76-PWP-08', updated_at = datetime('now') WHERE id = 471 AND codigo = '_TMP_471' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-08', updated_at = datetime('now') WHERE codigo = '76-DUAHV' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-08', updated_at = datetime('now') WHERE codigo_manobra = '76-DUAHV' AND deleted_at IS NULL;
-- 76-FLWNR → S76-PWP-09
UPDATE manobras SET codigo = 'S76-PWP-09', updated_at = datetime('now') WHERE id = 476 AND codigo = '_TMP_476' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-09', updated_at = datetime('now') WHERE codigo = '76-FLWNR' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-09', updated_at = datetime('now') WHERE codigo_manobra = '76-FLWNR' AND deleted_at IS NULL;
-- 76-FUMBG → S76-PWP-10
UPDATE manobras SET codigo = 'S76-PWP-10', updated_at = datetime('now') WHERE id = 480 AND codigo = '_TMP_480' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-10', updated_at = datetime('now') WHERE codigo = '76-FUMBG' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-10', updated_at = datetime('now') WHERE codigo_manobra = '76-FUMBG' AND deleted_at IS NULL;
-- 76-INCCB → S76-PWP-11
UPDATE manobras SET codigo = 'S76-PWP-11', updated_at = datetime('now') WHERE id = 479 AND codigo = '_TMP_479' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-11', updated_at = datetime('now') WHERE codigo = '76-INCCB' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-11', updated_at = datetime('now') WHERE codigo_manobra = '76-INCCB' AND deleted_at IS NULL;
-- 76-INCMO → S76-PWP-12
UPDATE manobras SET codigo = 'S76-PWP-12', updated_at = datetime('now') WHERE id = 478 AND codigo = '_TMP_478' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-12', updated_at = datetime('now') WHERE codigo = '76-INCMO' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-12', updated_at = datetime('now') WHERE codigo_manobra = '76-INCMO' AND deleted_at IS NULL;
-- 76-MOTAP → S76-PWP-13
UPDATE manobras SET codigo = 'S76-PWP-13', updated_at = datetime('now') WHERE id = 470 AND codigo = '_TMP_470' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-13', updated_at = datetime('now') WHERE codigo = '76-MOTAP' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-13', updated_at = datetime('now') WHERE codigo_manobra = '76-MOTAP' AND deleted_at IS NULL;
-- 76-MOTCA → S76-PWP-14
UPDATE manobras SET codigo = 'S76-PWP-14', updated_at = datetime('now') WHERE id = 466 AND codigo = '_TMP_466' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-14', updated_at = datetime('now') WHERE codigo = '76-MOTCA' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-14', updated_at = datetime('now') WHERE codigo_manobra = '76-MOTCA' AND deleted_at IS NULL;
-- 76-MOTCB → S76-PWP-15
UPDATE manobras SET codigo = 'S76-PWP-15', updated_at = datetime('now') WHERE id = 467 AND codigo = '_TMP_467' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-15', updated_at = datetime('now') WHERE codigo = '76-MOTCB' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-15', updated_at = datetime('now') WHERE codigo_manobra = '76-MOTCB' AND deleted_at IS NULL;
-- 76-MOTCZ → S76-PWP-16
UPDATE manobras SET codigo = 'S76-PWP-16', updated_at = datetime('now') WHERE id = 469 AND codigo = '_TMP_469' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-16', updated_at = datetime('now') WHERE codigo = '76-MOTCZ' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-16', updated_at = datetime('now') WHERE codigo_manobra = '76-MOTCZ' AND deleted_at IS NULL;
-- 76-MOTHV → S76-PWP-17
UPDATE manobras SET codigo = 'S76-PWP-17', updated_at = datetime('now') WHERE id = 468 AND codigo = '_TMP_468' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-17', updated_at = datetime('now') WHERE codigo = '76-MOTHV' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-17', updated_at = datetime('now') WHERE codigo_manobra = '76-MOTHV' AND deleted_at IS NULL;
-- 76-N1TQF → S76-PWP-18
UPDATE manobras SET codigo = 'S76-PWP-18', updated_at = datetime('now') WHERE id = 477 AND codigo = '_TMP_477' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-18', updated_at = datetime('now') WHERE codigo = '76-N1TQF' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-18', updated_at = datetime('now') WHERE codigo_manobra = '76-N1TQF' AND deleted_at IS NULL;
-- 76-OILMT → S76-PWP-19
UPDATE manobras SET codigo = 'S76-PWP-19', updated_at = datetime('now') WHERE id = 474 AND codigo = '_TMP_474' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PWP-19', updated_at = datetime('now') WHERE codigo = '76-OILMT' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PWP-19', updated_at = datetime('now') WHERE codigo_manobra = '76-OILMT' AND deleted_at IS NULL;
-- LOFT-CHK-01 → A139-CHK-01
UPDATE manobras SET codigo = 'A139-CHK-01', updated_at = datetime('now') WHERE id = 736 AND codigo = '_TMP_736' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-01', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-01', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-01' AND deleted_at IS NULL;
-- LOFT-CHK-02 → A139-CHK-02
UPDATE manobras SET codigo = 'A139-CHK-02', updated_at = datetime('now') WHERE id = 737 AND codigo = '_TMP_737' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-02', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-02', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-02' AND deleted_at IS NULL;
-- LOFT-CHK-03 → A139-CHK-03
UPDATE manobras SET codigo = 'A139-CHK-03', updated_at = datetime('now') WHERE id = 738 AND codigo = '_TMP_738' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-03', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-03' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-03', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-03' AND deleted_at IS NULL;
-- LOFT-CHK-04 → A139-CHK-04
UPDATE manobras SET codigo = 'A139-CHK-04', updated_at = datetime('now') WHERE id = 739 AND codigo = '_TMP_739' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-04', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-04' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-04', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-04' AND deleted_at IS NULL;
-- LOFT-NOT-01 → A139-PRE-01
UPDATE manobras SET codigo = 'A139-PRE-01', updated_at = datetime('now') WHERE id = 780 AND codigo = '_TMP_780' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRE-01', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRE-01', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-01' AND deleted_at IS NULL;
-- LOFT-NOT-02 → A139-PRE-02
UPDATE manobras SET codigo = 'A139-PRE-02', updated_at = datetime('now') WHERE id = 781 AND codigo = '_TMP_781' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRE-02', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRE-02', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-02' AND deleted_at IS NULL;
-- LOFT-NOT-03 → A139-PRE-03
UPDATE manobras SET codigo = 'A139-PRE-03', updated_at = datetime('now') WHERE id = 782 AND codigo = '_TMP_782' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRE-03', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-03' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRE-03', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-03' AND deleted_at IS NULL;
-- LOFT-NOT-04 → A139-PRE-04
UPDATE manobras SET codigo = 'A139-PRE-04', updated_at = datetime('now') WHERE id = 783 AND codigo = '_TMP_783' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRE-04', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-04' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRE-04', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-04' AND deleted_at IS NULL;
-- LOFT-OFF-01 → A139-OFF-01
UPDATE manobras SET codigo = 'A139-OFF-01', updated_at = datetime('now') WHERE id = 758 AND codigo = '_TMP_758' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-01', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-01', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-01' AND deleted_at IS NULL;
-- LOFT-OFF-02 → A139-OFF-02
UPDATE manobras SET codigo = 'A139-OFF-02', updated_at = datetime('now') WHERE id = 759 AND codigo = '_TMP_759' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-02', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-02', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-02' AND deleted_at IS NULL;
-- LOFT-OFF-03 → A139-OFF-03
UPDATE manobras SET codigo = 'A139-OFF-03', updated_at = datetime('now') WHERE id = 760 AND codigo = '_TMP_760' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-03', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-03' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-03', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-03' AND deleted_at IS NULL;
-- LOFT-OFF-04 → A139-OFF-04
UPDATE manobras SET codigo = 'A139-OFF-04', updated_at = datetime('now') WHERE id = 761 AND codigo = '_TMP_761' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-04', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-04' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-04', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-04' AND deleted_at IS NULL;
-- S76-LOFT-01 → S76-LFT-01
UPDATE manobras SET codigo = 'S76-LFT-01', updated_at = datetime('now') WHERE id = 618 AND codigo = '_TMP_618' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-01', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-01' AND deleted_at IS NULL;
-- S76-LOFT-02 → S76-LFT-02
UPDATE manobras SET codigo = 'S76-LFT-02', updated_at = datetime('now') WHERE id = 619 AND codigo = '_TMP_619' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-02', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-02' AND deleted_at IS NULL;
-- S76-LOFT-03 → S76-LFT-03
UPDATE manobras SET codigo = 'S76-LFT-03', updated_at = datetime('now') WHERE id = 620 AND codigo = '_TMP_620' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-03', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-03' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-03' AND deleted_at IS NULL;
-- S76-LOFT-04 → S76-LFT-04
UPDATE manobras SET codigo = 'S76-LFT-04', updated_at = datetime('now') WHERE id = 621 AND codigo = '_TMP_621' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-04', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-04' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-04', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-04' AND deleted_at IS NULL;
-- A139-CKL-01 → A139-PRC-01
UPDATE manobras SET codigo = 'A139-PRC-01', updated_at = datetime('now') WHERE id = 898 AND codigo = '_TMP_898' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-01', updated_at = datetime('now') WHERE codigo = 'A139-CKL-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-01', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-01' AND deleted_at IS NULL;
-- A139-CKL-02 → A139-PRC-02
UPDATE manobras SET codigo = 'A139-PRC-02', updated_at = datetime('now') WHERE id = 899 AND codigo = '_TMP_899' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-02', updated_at = datetime('now') WHERE codigo = 'A139-CKL-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-02', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-02' AND deleted_at IS NULL;
-- A139-CKL-03 → A139-PRC-03
UPDATE manobras SET codigo = 'A139-PRC-03', updated_at = datetime('now') WHERE id = 900 AND codigo = '_TMP_900' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-03', updated_at = datetime('now') WHERE codigo = 'A139-CKL-03' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-03', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-03' AND deleted_at IS NULL;
-- A139-CKL-04 → A139-PRC-04
UPDATE manobras SET codigo = 'A139-PRC-04', updated_at = datetime('now') WHERE id = 901 AND codigo = '_TMP_901' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-04', updated_at = datetime('now') WHERE codigo = 'A139-CKL-04' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-04', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-04' AND deleted_at IS NULL;
-- A139-CKL-05 → A139-PRC-05
UPDATE manobras SET codigo = 'A139-PRC-05', updated_at = datetime('now') WHERE id = 902 AND codigo = '_TMP_902' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-05', updated_at = datetime('now') WHERE codigo = 'A139-CKL-05' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-05', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-05' AND deleted_at IS NULL;
-- A139-CKL-06 → A139-PRC-06
UPDATE manobras SET codigo = 'A139-PRC-06', updated_at = datetime('now') WHERE id = 903 AND codigo = '_TMP_903' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-06', updated_at = datetime('now') WHERE codigo = 'A139-CKL-06' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-06', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CKL-06' AND deleted_at IS NULL;
-- A139-QRH-01 → A139-PRC-01A
UPDATE manobras SET codigo = 'A139-PRC-01A', updated_at = datetime('now') WHERE id = 918 AND codigo = '_TMP_918' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-01A', updated_at = datetime('now') WHERE codigo = 'A139-QRH-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-01A', updated_at = datetime('now') WHERE codigo_manobra = 'A139-QRH-01' AND deleted_at IS NULL;
-- 76-APXNP → S76-PRC-01
UPDATE manobras SET codigo = 'S76-PRC-01', updated_at = datetime('now') WHERE id = 445 AND codigo = '_TMP_445' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PRC-01', updated_at = datetime('now') WHERE codigo = '76-APXNP' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PRC-01', updated_at = datetime('now') WHERE codigo_manobra = '76-APXNP' AND deleted_at IS NULL;
-- 76-APXOI → S76-PRC-02
UPDATE manobras SET codigo = 'S76-PRC-02', updated_at = datetime('now') WHERE id = 446 AND codigo = '_TMP_446' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PRC-02', updated_at = datetime('now') WHERE codigo = '76-APXOI' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PRC-02', updated_at = datetime('now') WHERE codigo_manobra = '76-APXOI' AND deleted_at IS NULL;
-- 76-APXPR → S76-PRC-03
UPDATE manobras SET codigo = 'S76-PRC-03', updated_at = datetime('now') WHERE id = 444 AND codigo = '_TMP_444' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PRC-03', updated_at = datetime('now') WHERE codigo = '76-APXPR' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PRC-03', updated_at = datetime('now') WHERE codigo_manobra = '76-APXPR' AND deleted_at IS NULL;
-- 76-DECSI → S76-PRC-04
UPDATE manobras SET codigo = 'S76-PRC-04', updated_at = datetime('now') WHERE id = 442 AND codigo = '_TMP_442' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PRC-04', updated_at = datetime('now') WHERE codigo = '76-DECSI' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PRC-04', updated_at = datetime('now') WHERE codigo_manobra = '76-DECSI' AND deleted_at IS NULL;
-- 76-PRGGP → S76-PRC-05
UPDATE manobras SET codigo = 'S76-PRC-05', updated_at = datetime('now') WHERE id = 443 AND codigo = '_TMP_443' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-PRC-05', updated_at = datetime('now') WHERE codigo = '76-PRGGP' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-PRC-05', updated_at = datetime('now') WHERE codigo_manobra = '76-PRGGP' AND deleted_at IS NULL;
-- OPS-APP-X1 → A139-APP-01
UPDATE manobras SET codigo = 'A139-APP-01', updated_at = datetime('now') WHERE id = 372 AND codigo = '_TMP_372' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-APP-01', updated_at = datetime('now') WHERE codigo = 'OPS-APP-X1' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-APP-01', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-APP-X1' AND deleted_at IS NULL;
-- OPS-APP-X2 → A139-APP-02
UPDATE manobras SET codigo = 'A139-APP-02', updated_at = datetime('now') WHERE id = 373 AND codigo = '_TMP_373' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-APP-02', updated_at = datetime('now') WHERE codigo = 'OPS-APP-X2' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-APP-02', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-APP-X2' AND deleted_at IS NULL;
-- OPS-APP-X3 → A139-APP-03
UPDATE manobras SET codigo = 'A139-APP-03', updated_at = datetime('now') WHERE id = 374 AND codigo = '_TMP_374' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-APP-03', updated_at = datetime('now') WHERE codigo = 'OPS-APP-X3' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-APP-03', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-APP-X3' AND deleted_at IS NULL;
-- OPS-APP-X4 → A139-APP-04
UPDATE manobras SET codigo = 'A139-APP-04', updated_at = datetime('now') WHERE id = 375 AND codigo = '_TMP_375' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-APP-04', updated_at = datetime('now') WHERE codigo = 'OPS-APP-X4' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-APP-04', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-APP-X4' AND deleted_at IS NULL;
-- OPS-NAV-X1 → A139-NAV-01
UPDATE manobras SET codigo = 'A139-NAV-01', updated_at = datetime('now') WHERE id = 376 AND codigo = '_TMP_376' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NAV-01', updated_at = datetime('now') WHERE codigo = 'OPS-NAV-X1' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NAV-01', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NAV-X1' AND deleted_at IS NULL;
-- OPS-NAV-X2 → A139-NAV-02
UPDATE manobras SET codigo = 'A139-NAV-02', updated_at = datetime('now') WHERE id = 377 AND codigo = '_TMP_377' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NAV-02', updated_at = datetime('now') WHERE codigo = 'OPS-NAV-X2' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NAV-02', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NAV-X2' AND deleted_at IS NULL;
-- OPS-NAV-X3 → A139-NAV-03
UPDATE manobras SET codigo = 'A139-NAV-03', updated_at = datetime('now') WHERE id = 378 AND codigo = '_TMP_378' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NAV-03', updated_at = datetime('now') WHERE codigo = 'OPS-NAV-X3' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NAV-03', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NAV-X3' AND deleted_at IS NULL;
-- OPS-NAV-X4 → A139-NAV-04
UPDATE manobras SET codigo = 'A139-NAV-04', updated_at = datetime('now') WHERE id = 379 AND codigo = '_TMP_379' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NAV-04', updated_at = datetime('now') WHERE codigo = 'OPS-NAV-X4' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NAV-04', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NAV-X4' AND deleted_at IS NULL;
-- OPS-NRM-X1 → A139-NRM-01
UPDATE manobras SET codigo = 'A139-NRM-01', updated_at = datetime('now') WHERE id = 369 AND codigo = '_TMP_369' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NRM-01', updated_at = datetime('now') WHERE codigo = 'OPS-NRM-X1' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NRM-01', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NRM-X1' AND deleted_at IS NULL;
-- OPS-NRM-X2 → A139-NRM-02
UPDATE manobras SET codigo = 'A139-NRM-02', updated_at = datetime('now') WHERE id = 370 AND codigo = '_TMP_370' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NRM-02', updated_at = datetime('now') WHERE codigo = 'OPS-NRM-X2' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NRM-02', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NRM-X2' AND deleted_at IS NULL;
-- OPS-NRM-X3 → A139-NRM-03
UPDATE manobras SET codigo = 'A139-NRM-03', updated_at = datetime('now') WHERE id = 371 AND codigo = '_TMP_371' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NRM-03', updated_at = datetime('now') WHERE codigo = 'OPS-NRM-X3' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NRM-03', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-NRM-X3' AND deleted_at IS NULL;
-- OPS-OFF-X1 → A139-OFF-01A
UPDATE manobras SET codigo = 'A139-OFF-01A', updated_at = datetime('now') WHERE id = 380 AND codigo = '_TMP_380' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-01A', updated_at = datetime('now') WHERE codigo = 'OPS-OFF-X1' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-01A', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-OFF-X1' AND deleted_at IS NULL;
-- OPS-OFF-X2 → A139-OFF-02A
UPDATE manobras SET codigo = 'A139-OFF-02A', updated_at = datetime('now') WHERE id = 381 AND codigo = '_TMP_381' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-02A', updated_at = datetime('now') WHERE codigo = 'OPS-OFF-X2' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-02A', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-OFF-X2' AND deleted_at IS NULL;
-- S76-LOFT-23 → S76-NOT-23
UPDATE manobras SET codigo = 'S76-NOT-23', updated_at = datetime('now') WHERE id = 811 AND codigo = '_TMP_811' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-23', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-23' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-23', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-23' AND deleted_at IS NULL;
-- LOFT-NOT-24 → A139-PRC-24
UPDATE manobras SET codigo = 'A139-PRC-24', updated_at = datetime('now') WHERE id = 803 AND codigo = '_TMP_803' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-24', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-24' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-24', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-24' AND deleted_at IS NULL;
-- LOFT-NOT-25 → A139-PRC-25
UPDATE manobras SET codigo = 'A139-PRC-25', updated_at = datetime('now') WHERE id = 804 AND codigo = '_TMP_804' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-25', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-25' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-25', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-25' AND deleted_at IS NULL;
-- LOFT-NOT-29 → A139-PRC-29
UPDATE manobras SET codigo = 'A139-PRC-29', updated_at = datetime('now') WHERE id = 808 AND codigo = '_TMP_808' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-PRC-29', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-29' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-PRC-29', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-29' AND deleted_at IS NULL;
-- S76-LOFT-27 → S76-NOT-27
UPDATE manobras SET codigo = 'S76-NOT-27', updated_at = datetime('now') WHERE id = 815 AND codigo = '_TMP_815' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-27', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-27' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-27', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-27' AND deleted_at IS NULL;
-- S76-LOFT-31 → S76-NOT-31
UPDATE manobras SET codigo = 'S76-NOT-31', updated_at = datetime('now') WHERE id = 819 AND codigo = '_TMP_819' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-NOT-31', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-31' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-NOT-31', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-31' AND deleted_at IS NULL;
-- 76-HIDPB → S76-SIS-04
UPDATE manobras SET codigo = 'S76-SIS-04', updated_at = datetime('now') WHERE id = 489 AND codigo = '_TMP_489' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-04', updated_at = datetime('now') WHERE codigo = '76-HIDPB' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-04', updated_at = datetime('now') WHERE codigo_manobra = '76-HIDPB' AND deleted_at IS NULL;
-- 76-AMOTV → S76-SIS-01
UPDATE manobras SET codigo = 'S76-SIS-01', updated_at = datetime('now') WHERE id = 486 AND codigo = '_TMP_486' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-01', updated_at = datetime('now') WHERE codigo = '76-AMOTV' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-01', updated_at = datetime('now') WHERE codigo_manobra = '76-AMOTV' AND deleted_at IS NULL;
-- 76-CHPTG → S76-SIS-02
UPDATE manobras SET codigo = 'S76-SIS-02', updated_at = datetime('now') WHERE id = 483 AND codigo = '_TMP_483' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-02', updated_at = datetime('now') WHERE codigo = '76-CHPTG' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-02', updated_at = datetime('now') WHERE codigo_manobra = '76-CHPTG' AND deleted_at IS NULL;
-- 76-CTRRC → S76-SIS-03
UPDATE manobras SET codigo = 'S76-SIS-03', updated_at = datetime('now') WHERE id = 488 AND codigo = '_TMP_488' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-03', updated_at = datetime('now') WHERE codigo = '76-CTRRC' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-03', updated_at = datetime('now') WHERE codigo_manobra = '76-CTRRC' AND deleted_at IS NULL;
-- 76-MGBOL → S76-SIS-05
UPDATE manobras SET codigo = 'S76-SIS-05', updated_at = datetime('now') WHERE id = 482 AND codigo = '_TMP_482' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-05', updated_at = datetime('now') WHERE codigo = '76-MGBOL' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-05', updated_at = datetime('now') WHERE codigo_manobra = '76-MGBOL' AND deleted_at IS NULL;
-- 76-MGBSF → S76-SIS-06
UPDATE manobras SET codigo = 'S76-SIS-06', updated_at = datetime('now') WHERE id = 481 AND codigo = '_TMP_481' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-06', updated_at = datetime('now') WHERE codigo = '76-MGBSF' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-06', updated_at = datetime('now') WHERE codigo_manobra = '76-MGBSF' AND deleted_at IS NULL;
-- 76-SERJM → S76-SIS-07
UPDATE manobras SET codigo = 'S76-SIS-07', updated_at = datetime('now') WHERE id = 485 AND codigo = '_TMP_485' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-07', updated_at = datetime('now') WHERE codigo = '76-SERJM' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-07', updated_at = datetime('now') WHERE codigo_manobra = '76-SERJM' AND deleted_at IS NULL;
-- 76-SERTQ → S76-SIS-08
UPDATE manobras SET codigo = 'S76-SIS-08', updated_at = datetime('now') WHERE id = 484 AND codigo = '_TMP_484' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-08', updated_at = datetime('now') WHERE codigo = '76-SERTQ' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-08', updated_at = datetime('now') WHERE codigo_manobra = '76-SERTQ' AND deleted_at IS NULL;
-- 76-TRSRC → S76-SIS-09
UPDATE manobras SET codigo = 'S76-SIS-09', updated_at = datetime('now') WHERE id = 487 AND codigo = '_TMP_487' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SIS-09', updated_at = datetime('now') WHERE codigo = '76-TRSRC' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SIS-09', updated_at = datetime('now') WHERE codigo_manobra = '76-TRSRC' AND deleted_at IS NULL;
-- LOFT-CHK-05 → A139-CHK-05
UPDATE manobras SET codigo = 'A139-CHK-05', updated_at = datetime('now') WHERE id = 740 AND codigo = '_TMP_740' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-05', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-05' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-05', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-05' AND deleted_at IS NULL;
-- LOFT-CHK-06 → A139-CHK-06
UPDATE manobras SET codigo = 'A139-CHK-06', updated_at = datetime('now') WHERE id = 741 AND codigo = '_TMP_741' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-06', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-06' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-06', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-06' AND deleted_at IS NULL;
-- LOFT-CHK-07 → A139-CHK-07
UPDATE manobras SET codigo = 'A139-CHK-07', updated_at = datetime('now') WHERE id = 742 AND codigo = '_TMP_742' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-07', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-07' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-07', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-07' AND deleted_at IS NULL;
-- LOFT-NOT-05 → A139-SOL-05
UPDATE manobras SET codigo = 'A139-SOL-05', updated_at = datetime('now') WHERE id = 784 AND codigo = '_TMP_784' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-SOL-05', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-05' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-SOL-05', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-05' AND deleted_at IS NULL;
-- LOFT-NOT-06 → A139-SOL-06
UPDATE manobras SET codigo = 'A139-SOL-06', updated_at = datetime('now') WHERE id = 785 AND codigo = '_TMP_785' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-SOL-06', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-06' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-SOL-06', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-06' AND deleted_at IS NULL;
-- LOFT-NOT-07 → A139-SOL-07
UPDATE manobras SET codigo = 'A139-SOL-07', updated_at = datetime('now') WHERE id = 786 AND codigo = '_TMP_786' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-SOL-07', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-07' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-SOL-07', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-07' AND deleted_at IS NULL;
-- LOFT-OFF-05 → A139-OFF-05
UPDATE manobras SET codigo = 'A139-OFF-05', updated_at = datetime('now') WHERE id = 762 AND codigo = '_TMP_762' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-05', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-05' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-05', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-05' AND deleted_at IS NULL;
-- LOFT-OFF-06 → A139-OFF-06
UPDATE manobras SET codigo = 'A139-OFF-06', updated_at = datetime('now') WHERE id = 763 AND codigo = '_TMP_763' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-06', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-06' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-06', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-06' AND deleted_at IS NULL;
-- LOFT-OFF-07 → A139-OFF-07
UPDATE manobras SET codigo = 'A139-OFF-07', updated_at = datetime('now') WHERE id = 764 AND codigo = '_TMP_764' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-07', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-07' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-07', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-07' AND deleted_at IS NULL;
-- S76-LOFT-05 → S76-LFT-05
UPDATE manobras SET codigo = 'S76-LFT-05', updated_at = datetime('now') WHERE id = 622 AND codigo = '_TMP_622' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-05', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-05' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-05', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-05' AND deleted_at IS NULL;
-- S76-LOFT-06 → S76-LFT-06
UPDATE manobras SET codigo = 'S76-LFT-06', updated_at = datetime('now') WHERE id = 623 AND codigo = '_TMP_623' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-06', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-06' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-06', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-06' AND deleted_at IS NULL;
-- S76-LOFT-07 → S76-LFT-07
UPDATE manobras SET codigo = 'S76-LFT-07', updated_at = datetime('now') WHERE id = 624 AND codigo = '_TMP_624' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-07', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-07' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-07', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-07' AND deleted_at IS NULL;
-- S76-LOFT-08 → S76-LFT-08
UPDATE manobras SET codigo = 'S76-LFT-08', updated_at = datetime('now') WHERE id = 625 AND codigo = '_TMP_625' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-08', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-08' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-08', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-08' AND deleted_at IS NULL;
-- S76-ACG-48 → S76-SOL-48
UPDATE manobras SET codigo = 'S76-SOL-48', updated_at = datetime('now') WHERE id = 551 AND codigo = '_TMP_551' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-48', updated_at = datetime('now') WHERE codigo = 'S76-ACG-48' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-48', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ACG-48' AND deleted_at IS NULL;
-- S76-BTO-51 → S76-SOL-51
UPDATE manobras SET codigo = 'S76-SOL-51', updated_at = datetime('now') WHERE id = 513 AND codigo = '_TMP_513' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-51', updated_at = datetime('now') WHERE codigo = 'S76-BTO-51' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-51', updated_at = datetime('now') WHERE codigo_manobra = 'S76-BTO-51' AND deleted_at IS NULL;
-- S76-FGF-29 → S76-SOL-29
UPDATE manobras SET codigo = 'S76-SOL-29', updated_at = datetime('now') WHERE id = 567 AND codigo = '_TMP_567' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-29', updated_at = datetime('now') WHERE codigo = 'S76-FGF-29' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-29', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FGF-29' AND deleted_at IS NULL;
-- S76-FMG-08 → S76-SOL-08
UPDATE manobras SET codigo = 'S76-SOL-08', updated_at = datetime('now') WHERE id = 493 AND codigo = '_TMP_493' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-08', updated_at = datetime('now') WHERE codigo = 'S76-FMG-08' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-08', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMG-08' AND deleted_at IS NULL;
-- S76-FMI-09 → S76-SOL-09
UPDATE manobras SET codigo = 'S76-SOL-09', updated_at = datetime('now') WHERE id = 494 AND codigo = '_TMP_494' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-09', updated_at = datetime('now') WHERE codigo = 'S76-FMI-09' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-09', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FMI-09' AND deleted_at IS NULL;
-- S76-INV-49 → S76-SOL-49
UPDATE manobras SET codigo = 'S76-SOL-49', updated_at = datetime('now') WHERE id = 552 AND codigo = '_TMP_552' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-49', updated_at = datetime('now') WHERE codigo = 'S76-INV-49' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-49', updated_at = datetime('now') WHERE codigo_manobra = 'S76-INV-49' AND deleted_at IS NULL;
-- S76-RMF-69 → S76-SOL-69
UPDATE manobras SET codigo = 'S76-SOL-69', updated_at = datetime('now') WHERE id = 514 AND codigo = '_TMP_514' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-69', updated_at = datetime('now') WHERE codigo = 'S76-RMF-69' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-69', updated_at = datetime('now') WHERE codigo_manobra = 'S76-RMF-69' AND deleted_at IS NULL;
-- S76-WCP-73 → S76-SOL-73
UPDATE manobras SET codigo = 'S76-SOL-73', updated_at = datetime('now') WHERE id = 568 AND codigo = '_TMP_568' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SOL-73', updated_at = datetime('now') WHERE codigo = 'S76-WCP-73' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SOL-73', updated_at = datetime('now') WHERE codigo_manobra = 'S76-WCP-73' AND deleted_at IS NULL;
-- S76-BFL-28 → S76-SUB-28
UPDATE manobras SET codigo = 'S76-SUB-28', updated_at = datetime('now') WHERE id = 569 AND codigo = '_TMP_569' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-28', updated_at = datetime('now') WHERE codigo = 'S76-BFL-28' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-28', updated_at = datetime('now') WHERE codigo_manobra = 'S76-BFL-28' AND deleted_at IS NULL;
-- S76-NRL-00 → S76-SUB-02
UPDATE manobras SET codigo = 'S76-SUB-02', updated_at = datetime('now') WHERE id = 502 AND codigo = '_TMP_502' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-02', updated_at = datetime('now') WHERE codigo = 'S76-NRL-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NRL-00' AND deleted_at IS NULL;
-- S76-NRO-00 → S76-SUB-01
UPDATE manobras SET codigo = 'S76-SUB-01', updated_at = datetime('now') WHERE id = 501 AND codigo = '_TMP_501' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-01', updated_at = datetime('now') WHERE codigo = 'S76-NRO-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-NRO-00' AND deleted_at IS NULL;
-- S76-OSP-27 → S76-SUB-27
UPDATE manobras SET codigo = 'S76-SUB-27', updated_at = datetime('now') WHERE id = 535 AND codigo = '_TMP_535' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-27', updated_at = datetime('now') WHERE codigo = 'S76-OSP-27' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-27', updated_at = datetime('now') WHERE codigo_manobra = 'S76-OSP-27' AND deleted_at IS NULL;
-- S76-PAL-30 → S76-SUB-30
UPDATE manobras SET codigo = 'S76-SUB-30', updated_at = datetime('now') WHERE id = 570 AND codigo = '_TMP_570' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-30', updated_at = datetime('now') WHERE codigo = 'S76-PAL-30' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-30', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PAL-30' AND deleted_at IS NULL;
-- S76-SID-00 → S76-SUB-03
UPDATE manobras SET codigo = 'S76-SUB-03', updated_at = datetime('now') WHERE id = 517 AND codigo = '_TMP_517' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-SUB-03', updated_at = datetime('now') WHERE codigo = 'S76-SID-00' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-SUB-03', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SID-00' AND deleted_at IS NULL;
-- A139-AFC-01 → A139-TRE-01
UPDATE manobras SET codigo = 'A139-TRE-01', updated_at = datetime('now') WHERE id = 891 AND codigo = '_TMP_891' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01', updated_at = datetime('now') WHERE codigo = 'A139-AFC-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01', updated_at = datetime('now') WHERE codigo_manobra = 'A139-AFC-01' AND deleted_at IS NULL;
-- A139-ARN-01 → A139-TRE-01A
UPDATE manobras SET codigo = 'A139-TRE-01A', updated_at = datetime('now') WHERE id = 892 AND codigo = '_TMP_892' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01A', updated_at = datetime('now') WHERE codigo = 'A139-ARN-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01A', updated_at = datetime('now') WHERE codigo_manobra = 'A139-ARN-01' AND deleted_at IS NULL;
-- A139-CAB-01 → A139-TRE-01B
UPDATE manobras SET codigo = 'A139-TRE-01B', updated_at = datetime('now') WHERE id = 894 AND codigo = '_TMP_894' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01B', updated_at = datetime('now') WHERE codigo = 'A139-CAB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01B', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CAB-01' AND deleted_at IS NULL;
-- A139-CAS-01 → A139-TRE-01C
UPDATE manobras SET codigo = 'A139-TRE-01C', updated_at = datetime('now') WHERE id = 895 AND codigo = '_TMP_895' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01C', updated_at = datetime('now') WHERE codigo = 'A139-CAS-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01C', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CAS-01' AND deleted_at IS NULL;
-- A139-CATB-01 → A139-TRE-01D
UPDATE manobras SET codigo = 'A139-TRE-01D', updated_at = datetime('now') WHERE id = 896 AND codigo = '_TMP_896' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01D', updated_at = datetime('now') WHERE codigo = 'A139-CATB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01D', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CATB-01' AND deleted_at IS NULL;
-- A139-CATB-02 → A139-TRE-02
UPDATE manobras SET codigo = 'A139-TRE-02', updated_at = datetime('now') WHERE id = 897 AND codigo = '_TMP_897' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-02', updated_at = datetime('now') WHERE codigo = 'A139-CATB-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-02', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CATB-02' AND deleted_at IS NULL;
-- A139-CRV-01 → A139-TRE-01E
UPDATE manobras SET codigo = 'A139-TRE-01E', updated_at = datetime('now') WHERE id = 904 AND codigo = '_TMP_904' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01E', updated_at = datetime('now') WHERE codigo = 'A139-CRV-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01E', updated_at = datetime('now') WHERE codigo_manobra = 'A139-CRV-01' AND deleted_at IS NULL;
-- A139-DSC-01 → A139-TRE-01F
UPDATE manobras SET codigo = 'A139-TRE-01F', updated_at = datetime('now') WHERE id = 905 AND codigo = '_TMP_905' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01F', updated_at = datetime('now') WHERE codigo = 'A139-DSC-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01F', updated_at = datetime('now') WHERE codigo_manobra = 'A139-DSC-01' AND deleted_at IS NULL;
-- A139-ENE-01 → A139-TRE-01G
UPDATE manobras SET codigo = 'A139-TRE-01G', updated_at = datetime('now') WHERE id = 906 AND codigo = '_TMP_906' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01G', updated_at = datetime('now') WHERE codigo = 'A139-ENE-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01G', updated_at = datetime('now') WHERE codigo_manobra = 'A139-ENE-01' AND deleted_at IS NULL;
-- A139-EST-01 → A139-TRE-01H
UPDATE manobras SET codigo = 'A139-TRE-01H', updated_at = datetime('now') WHERE id = 907 AND codigo = '_TMP_907' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01H', updated_at = datetime('now') WHERE codigo = 'A139-EST-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01H', updated_at = datetime('now') WHERE codigo_manobra = 'A139-EST-01' AND deleted_at IS NULL;
-- A139-FMA-01 → A139-TRE-01I
UPDATE manobras SET codigo = 'A139-TRE-01I', updated_at = datetime('now') WHERE id = 908 AND codigo = '_TMP_908' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01I', updated_at = datetime('now') WHERE codigo = 'A139-FMA-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01I', updated_at = datetime('now') WHERE codigo_manobra = 'A139-FMA-01' AND deleted_at IS NULL;
-- A139-FMA-02 → A139-TRE-02A
UPDATE manobras SET codigo = 'A139-TRE-02A', updated_at = datetime('now') WHERE id = 909 AND codigo = '_TMP_909' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-02A', updated_at = datetime('now') WHERE codigo = 'A139-FMA-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-02A', updated_at = datetime('now') WHERE codigo_manobra = 'A139-FMA-02' AND deleted_at IS NULL;
-- A139-HLD-01 → A139-TRE-01J
UPDATE manobras SET codigo = 'A139-TRE-01J', updated_at = datetime('now') WHERE id = 910 AND codigo = '_TMP_910' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01J', updated_at = datetime('now') WHERE codigo = 'A139-HLD-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01J', updated_at = datetime('now') WHERE codigo_manobra = 'A139-HLD-01' AND deleted_at IS NULL;
-- A139-IDF-01 → A139-TRE-01K
UPDATE manobras SET codigo = 'A139-TRE-01K', updated_at = datetime('now') WHERE id = 911 AND codigo = '_TMP_911' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01K', updated_at = datetime('now') WHERE codigo = 'A139-IDF-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01K', updated_at = datetime('now') WHERE codigo_manobra = 'A139-IDF-01' AND deleted_at IS NULL;
-- A139-MOD-01 → A139-TRE-01L
UPDATE manobras SET codigo = 'A139-TRE-01L', updated_at = datetime('now') WHERE id = 912 AND codigo = '_TMP_912' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01L', updated_at = datetime('now') WHERE codigo = 'A139-MOD-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01L', updated_at = datetime('now') WHERE codigo_manobra = 'A139-MOD-01' AND deleted_at IS NULL;
-- A139-ORI-01 → A139-TRE-01M
UPDATE manobras SET codigo = 'A139-TRE-01M', updated_at = datetime('now') WHERE id = 914 AND codigo = '_TMP_914' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01M', updated_at = datetime('now') WHERE codigo = 'A139-ORI-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01M', updated_at = datetime('now') WHERE codigo_manobra = 'A139-ORI-01' AND deleted_at IS NULL;
-- A139-PWR-01 → A139-TRE-01N
UPDATE manobras SET codigo = 'A139-TRE-01N', updated_at = datetime('now') WHERE id = 917 AND codigo = '_TMP_917' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01N', updated_at = datetime('now') WHERE codigo = 'A139-PWR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01N', updated_at = datetime('now') WHERE codigo_manobra = 'A139-PWR-01' AND deleted_at IS NULL;
-- A139-REC-01 → A139-TRE-01O
UPDATE manobras SET codigo = 'A139-TRE-01O', updated_at = datetime('now') WHERE id = 919 AND codigo = '_TMP_919' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01O', updated_at = datetime('now') WHERE codigo = 'A139-REC-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01O', updated_at = datetime('now') WHERE codigo_manobra = 'A139-REC-01' AND deleted_at IS NULL;
-- A139-REC-02 → A139-TRE-02B
UPDATE manobras SET codigo = 'A139-TRE-02B', updated_at = datetime('now') WHERE id = 920 AND codigo = '_TMP_920' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-02B', updated_at = datetime('now') WHERE codigo = 'A139-REC-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-02B', updated_at = datetime('now') WHERE codigo_manobra = 'A139-REC-02' AND deleted_at IS NULL;
-- A139-RNP-01 → A139-TRE-01P
UPDATE manobras SET codigo = 'A139-TRE-01P', updated_at = datetime('now') WHERE id = 921 AND codigo = '_TMP_921' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01P', updated_at = datetime('now') WHERE codigo = 'A139-RNP-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01P', updated_at = datetime('now') WHERE codigo_manobra = 'A139-RNP-01' AND deleted_at IS NULL;
-- A139-SCN-02 → A139-TRE-02C
UPDATE manobras SET codigo = 'A139-TRE-02C', updated_at = datetime('now') WHERE id = 923 AND codigo = '_TMP_923' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-02C', updated_at = datetime('now') WHERE codigo = 'A139-SCN-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-02C', updated_at = datetime('now') WHERE codigo_manobra = 'A139-SCN-02' AND deleted_at IS NULL;
-- A139-STB-01 → A139-TRE-01Q
UPDATE manobras SET codigo = 'A139-TRE-01Q', updated_at = datetime('now') WHERE id = 924 AND codigo = '_TMP_924' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01Q', updated_at = datetime('now') WHERE codigo = 'A139-STB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01Q', updated_at = datetime('now') WHERE codigo_manobra = 'A139-STB-01' AND deleted_at IS NULL;
-- A139-STB-02 → A139-TRE-02D
UPDATE manobras SET codigo = 'A139-TRE-02D', updated_at = datetime('now') WHERE id = 925 AND codigo = '_TMP_925' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-02D', updated_at = datetime('now') WHERE codigo = 'A139-STB-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-02D', updated_at = datetime('now') WHERE codigo_manobra = 'A139-STB-02' AND deleted_at IS NULL;
-- A139-SUB-01 → A139-TRE-01R
UPDATE manobras SET codigo = 'A139-TRE-01R', updated_at = datetime('now') WHERE id = 926 AND codigo = '_TMP_926' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01R', updated_at = datetime('now') WHERE codigo = 'A139-SUB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01R', updated_at = datetime('now') WHERE codigo_manobra = 'A139-SUB-01' AND deleted_at IS NULL;
-- A139-TAX-01 → A139-TRE-01S
UPDATE manobras SET codigo = 'A139-TRE-01S', updated_at = datetime('now') WHERE id = 927 AND codigo = '_TMP_927' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01S', updated_at = datetime('now') WHERE codigo = 'A139-TAX-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01S', updated_at = datetime('now') WHERE codigo_manobra = 'A139-TAX-01' AND deleted_at IS NULL;
-- A139-VCZ-01 → A139-TRE-01T
UPDATE manobras SET codigo = 'A139-TRE-01T', updated_at = datetime('now') WHERE id = 928 AND codigo = '_TMP_928' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01T', updated_at = datetime('now') WHERE codigo = 'A139-VCZ-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01T', updated_at = datetime('now') WHERE codigo_manobra = 'A139-VCZ-01' AND deleted_at IS NULL;
-- A139-VMA-01 → A139-TRE-01U
UPDATE manobras SET codigo = 'A139-TRE-01U', updated_at = datetime('now') WHERE id = 929 AND codigo = '_TMP_929' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-TRE-01U', updated_at = datetime('now') WHERE codigo = 'A139-VMA-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-TRE-01U', updated_at = datetime('now') WHERE codigo_manobra = 'A139-VMA-01' AND deleted_at IS NULL;
-- INV-ADM-01 → TRE-01K
UPDATE manobras SET codigo = 'TRE-01K', updated_at = datetime('now') WHERE id = 988 AND codigo = '_TMP_988' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01K', updated_at = datetime('now') WHERE codigo = 'INV-ADM-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01K', updated_at = datetime('now') WHERE codigo_manobra = 'INV-ADM-01' AND deleted_at IS NULL;
-- INV-BRF-01 → TRE-01L
UPDATE manobras SET codigo = 'TRE-01L', updated_at = datetime('now') WHERE id = 990 AND codigo = '_TMP_990' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01L', updated_at = datetime('now') WHERE codigo = 'INV-BRF-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01L', updated_at = datetime('now') WHERE codigo_manobra = 'INV-BRF-01' AND deleted_at IS NULL;
-- INV-CTL-01 → TRE-01M
UPDATE manobras SET codigo = 'TRE-01M', updated_at = datetime('now') WHERE id = 992 AND codigo = '_TMP_992' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01M', updated_at = datetime('now') WHERE codigo = 'INV-CTL-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01M', updated_at = datetime('now') WHERE codigo_manobra = 'INV-CTL-01' AND deleted_at IS NULL;
-- INV-DBF-01 → TRE-01N
UPDATE manobras SET codigo = 'TRE-01N', updated_at = datetime('now') WHERE id = 993 AND codigo = '_TMP_993' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01N', updated_at = datetime('now') WHERE codigo = 'INV-DBF-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01N', updated_at = datetime('now') WHERE codigo_manobra = 'INV-DBF-01' AND deleted_at IS NULL;
-- INV-DEM-01 → TRE-01O
UPDATE manobras SET codigo = 'TRE-01O', updated_at = datetime('now') WHERE id = 994 AND codigo = '_TMP_994' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01O', updated_at = datetime('now') WHERE codigo = 'INV-DEM-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01O', updated_at = datetime('now') WHERE codigo_manobra = 'INV-DEM-01' AND deleted_at IS NULL;
-- INV-EMR-01 → TRE-01P
UPDATE manobras SET codigo = 'TRE-01P', updated_at = datetime('now') WHERE id = 995 AND codigo = '_TMP_995' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01P', updated_at = datetime('now') WHERE codigo = 'INV-EMR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01P', updated_at = datetime('now') WHERE codigo_manobra = 'INV-EMR-01' AND deleted_at IS NULL;
-- INV-ERR-01 → TRE-01Q
UPDATE manobras SET codigo = 'TRE-01Q', updated_at = datetime('now') WHERE id = 996 AND codigo = '_TMP_996' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01Q', updated_at = datetime('now') WHERE codigo = 'INV-ERR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01Q', updated_at = datetime('now') WHERE codigo_manobra = 'INV-ERR-01' AND deleted_at IS NULL;
-- INV-ETH-01 → TRE-01R
UPDATE manobras SET codigo = 'TRE-01R', updated_at = datetime('now') WHERE id = 1002 AND codigo = '_TMP_1002' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01R', updated_at = datetime('now') WHERE codigo = 'INV-ETH-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01R', updated_at = datetime('now') WHERE codigo_manobra = 'INV-ETH-01' AND deleted_at IS NULL;
-- INV-EVL-01 → TRE-01S
UPDATE manobras SET codigo = 'TRE-01S', updated_at = datetime('now') WHERE id = 997 AND codigo = '_TMP_997' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01S', updated_at = datetime('now') WHERE codigo = 'INV-EVL-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01S', updated_at = datetime('now') WHERE codigo_manobra = 'INV-EVL-01' AND deleted_at IS NULL;
-- INV-PLN-01 → TRE-01T
UPDATE manobras SET codigo = 'TRE-01T', updated_at = datetime('now') WHERE id = 998 AND codigo = '_TMP_998' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01T', updated_at = datetime('now') WHERE codigo = 'INV-PLN-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01T', updated_at = datetime('now') WHERE codigo_manobra = 'INV-PLN-01' AND deleted_at IS NULL;
-- INV-SAF-01 → TRE-01U
UPDATE manobras SET codigo = 'TRE-01U', updated_at = datetime('now') WHERE id = 999 AND codigo = '_TMP_999' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01U', updated_at = datetime('now') WHERE codigo = 'INV-SAF-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01U', updated_at = datetime('now') WHERE codigo_manobra = 'INV-SAF-01' AND deleted_at IS NULL;
-- INV-UAR-01 → TRE-01V
UPDATE manobras SET codigo = 'TRE-01V', updated_at = datetime('now') WHERE id = 1000 AND codigo = '_TMP_1000' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'TRE-01V', updated_at = datetime('now') WHERE codigo = 'INV-UAR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'TRE-01V', updated_at = datetime('now') WHERE codigo_manobra = 'INV-UAR-01' AND deleted_at IS NULL;
-- OPS-OFF-X3 → A139-OFF-03A
UPDATE manobras SET codigo = 'A139-OFF-03A', updated_at = datetime('now') WHERE id = 931 AND codigo = '_TMP_931' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-03A', updated_at = datetime('now') WHERE codigo = 'OPS-OFF-X3' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-03A', updated_at = datetime('now') WHERE codigo_manobra = 'OPS-OFF-X3' AND deleted_at IS NULL;
-- S76-APN-01 → S76-TRE-01
UPDATE manobras SET codigo = 'S76-TRE-01', updated_at = datetime('now') WHERE id = 932 AND codigo = '_TMP_932' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01', updated_at = datetime('now') WHERE codigo = 'S76-APN-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01', updated_at = datetime('now') WHERE codigo_manobra = 'S76-APN-01' AND deleted_at IS NULL;
-- S76-APN-02 → S76-TRE-02
UPDATE manobras SET codigo = 'S76-TRE-02', updated_at = datetime('now') WHERE id = 933 AND codigo = '_TMP_933' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-02', updated_at = datetime('now') WHERE codigo = 'S76-APN-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-02', updated_at = datetime('now') WHERE codigo_manobra = 'S76-APN-02' AND deleted_at IS NULL;
-- S76-ARN-01 → S76-TRE-01A
UPDATE manobras SET codigo = 'S76-TRE-01A', updated_at = datetime('now') WHERE id = 936 AND codigo = '_TMP_936' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01A', updated_at = datetime('now') WHERE codigo = 'S76-ARN-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ARN-01' AND deleted_at IS NULL;
-- S76-CAB-01 → S76-TRE-01B
UPDATE manobras SET codigo = 'S76-TRE-01B', updated_at = datetime('now') WHERE id = 938 AND codigo = '_TMP_938' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01B', updated_at = datetime('now') WHERE codigo = 'S76-CAB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01B', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CAB-01' AND deleted_at IS NULL;
-- S76-CIR-01 → S76-TRE-01C
UPDATE manobras SET codigo = 'S76-TRE-01C', updated_at = datetime('now') WHERE id = 939 AND codigo = '_TMP_939' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01C', updated_at = datetime('now') WHERE codigo = 'S76-CIR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01C', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CIR-01' AND deleted_at IS NULL;
-- S76-CRV-01 → S76-TRE-01D
UPDATE manobras SET codigo = 'S76-TRE-01D', updated_at = datetime('now') WHERE id = 947 AND codigo = '_TMP_947' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01D', updated_at = datetime('now') WHERE codigo = 'S76-CRV-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01D', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CRV-01' AND deleted_at IS NULL;
-- S76-CTV-01 → S76-TRE-01E
UPDATE manobras SET codigo = 'S76-TRE-01E', updated_at = datetime('now') WHERE id = 948 AND codigo = '_TMP_948' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01E', updated_at = datetime('now') WHERE codigo = 'S76-CTV-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01E', updated_at = datetime('now') WHERE codigo_manobra = 'S76-CTV-01' AND deleted_at IS NULL;
-- S76-DNR-01 → S76-TRE-01F
UPDATE manobras SET codigo = 'S76-TRE-01F', updated_at = datetime('now') WHERE id = 949 AND codigo = '_TMP_949' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01F', updated_at = datetime('now') WHERE codigo = 'S76-DNR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01F', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DNR-01' AND deleted_at IS NULL;
-- S76-DSC-01 → S76-TRE-01G
UPDATE manobras SET codigo = 'S76-TRE-01G', updated_at = datetime('now') WHERE id = 950 AND codigo = '_TMP_950' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01G', updated_at = datetime('now') WHERE codigo = 'S76-DSC-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01G', updated_at = datetime('now') WHERE codigo_manobra = 'S76-DSC-01' AND deleted_at IS NULL;
-- S76-ENE-01 → S76-TRE-01H
UPDATE manobras SET codigo = 'S76-TRE-01H', updated_at = datetime('now') WHERE id = 951 AND codigo = '_TMP_951' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01H', updated_at = datetime('now') WHERE codigo = 'S76-ENE-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01H', updated_at = datetime('now') WHERE codigo_manobra = 'S76-ENE-01' AND deleted_at IS NULL;
-- S76-EST-01 → S76-TRE-01I
UPDATE manobras SET codigo = 'S76-TRE-01I', updated_at = datetime('now') WHERE id = 952 AND codigo = '_TMP_952' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01I', updated_at = datetime('now') WHERE codigo = 'S76-EST-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01I', updated_at = datetime('now') WHERE codigo_manobra = 'S76-EST-01' AND deleted_at IS NULL;
-- S76-FLU-01 → S76-TRE-01J
UPDATE manobras SET codigo = 'S76-TRE-01J', updated_at = datetime('now') WHERE id = 953 AND codigo = '_TMP_953' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01J', updated_at = datetime('now') WHERE codigo = 'S76-FLU-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01J', updated_at = datetime('now') WHERE codigo_manobra = 'S76-FLU-01' AND deleted_at IS NULL;
-- S76-GAR-01 → S76-TRE-01K
UPDATE manobras SET codigo = 'S76-TRE-01K', updated_at = datetime('now') WHERE id = 954 AND codigo = '_TMP_954' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01K', updated_at = datetime('now') WHERE codigo = 'S76-GAR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01K', updated_at = datetime('now') WHERE codigo_manobra = 'S76-GAR-01' AND deleted_at IS NULL;
-- S76-HVT-01 → S76-TRE-01L
UPDATE manobras SET codigo = 'S76-TRE-01L', updated_at = datetime('now') WHERE id = 955 AND codigo = '_TMP_955' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01L', updated_at = datetime('now') WHERE codigo = 'S76-HVT-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01L', updated_at = datetime('now') WHERE codigo_manobra = 'S76-HVT-01' AND deleted_at IS NULL;
-- S76-INS-01 → S76-TRE-01N
UPDATE manobras SET codigo = 'S76-TRE-01N', updated_at = datetime('now') WHERE id = 957 AND codigo = '_TMP_957' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01N', updated_at = datetime('now') WHERE codigo = 'S76-INS-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01N', updated_at = datetime('now') WHERE codigo_manobra = 'S76-INS-01' AND deleted_at IS NULL;
-- S76-PED-01 → S76-TRE-01O
UPDATE manobras SET codigo = 'S76-TRE-01O', updated_at = datetime('now') WHERE id = 959 AND codigo = '_TMP_959' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01O', updated_at = datetime('now') WHERE codigo = 'S76-PED-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01O', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PED-01' AND deleted_at IS NULL;
-- S76-PNO-01 → S76-TRE-01P
UPDATE manobras SET codigo = 'S76-TRE-01P', updated_at = datetime('now') WHERE id = 960 AND codigo = '_TMP_960' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01P', updated_at = datetime('now') WHERE codigo = 'S76-PNO-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01P', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PNO-01' AND deleted_at IS NULL;
-- S76-PNR-01 → S76-TRE-01Q
UPDATE manobras SET codigo = 'S76-TRE-01Q', updated_at = datetime('now') WHERE id = 961 AND codigo = '_TMP_961' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01Q', updated_at = datetime('now') WHERE codigo = 'S76-PNR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01Q', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PNR-01' AND deleted_at IS NULL;
-- S76-PWR-01 → S76-TRE-01R
UPDATE manobras SET codigo = 'S76-TRE-01R', updated_at = datetime('now') WHERE id = 962 AND codigo = '_TMP_962' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01R', updated_at = datetime('now') WHERE codigo = 'S76-PWR-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01R', updated_at = datetime('now') WHERE codigo_manobra = 'S76-PWR-01' AND deleted_at IS NULL;
-- S76-REC-01 → S76-TRE-01S
UPDATE manobras SET codigo = 'S76-TRE-01S', updated_at = datetime('now') WHERE id = 963 AND codigo = '_TMP_963' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01S', updated_at = datetime('now') WHERE codigo = 'S76-REC-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01S', updated_at = datetime('now') WHERE codigo_manobra = 'S76-REC-01' AND deleted_at IS NULL;
-- S76-REC-02 → S76-TRE-02A
UPDATE manobras SET codigo = 'S76-TRE-02A', updated_at = datetime('now') WHERE id = 964 AND codigo = '_TMP_964' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-02A', updated_at = datetime('now') WHERE codigo = 'S76-REC-02' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-02A', updated_at = datetime('now') WHERE codigo_manobra = 'S76-REC-02' AND deleted_at IS NULL;
-- S76-SCN-01 → S76-TRE-01T
UPDATE manobras SET codigo = 'S76-TRE-01T', updated_at = datetime('now') WHERE id = 965 AND codigo = '_TMP_965' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01T', updated_at = datetime('now') WHERE codigo = 'S76-SCN-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01T', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SCN-01' AND deleted_at IS NULL;
-- S76-STB-01 → S76-TRE-01U
UPDATE manobras SET codigo = 'S76-TRE-01U', updated_at = datetime('now') WHERE id = 966 AND codigo = '_TMP_966' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01U', updated_at = datetime('now') WHERE codigo = 'S76-STB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01U', updated_at = datetime('now') WHERE codigo_manobra = 'S76-STB-01' AND deleted_at IS NULL;
-- S76-SUB-01 → S76-TRE-01V
UPDATE manobras SET codigo = 'S76-TRE-01V', updated_at = datetime('now') WHERE id = 967 AND codigo = '_TMP_967' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01V', updated_at = datetime('now') WHERE codigo = 'S76-SUB-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01V', updated_at = datetime('now') WHERE codigo_manobra = 'S76-SUB-01' AND deleted_at IS NULL;
-- S76-TAX-01 → S76-TRE-01W
UPDATE manobras SET codigo = 'S76-TRE-01W', updated_at = datetime('now') WHERE id = 968 AND codigo = '_TMP_968' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01W', updated_at = datetime('now') WHERE codigo = 'S76-TAX-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01W', updated_at = datetime('now') WHERE codigo_manobra = 'S76-TAX-01' AND deleted_at IS NULL;
-- S76-VCZ-01 → S76-TRE-01X
UPDATE manobras SET codigo = 'S76-TRE-01X', updated_at = datetime('now') WHERE id = 969 AND codigo = '_TMP_969' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01X', updated_at = datetime('now') WHERE codigo = 'S76-VCZ-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01X', updated_at = datetime('now') WHERE codigo_manobra = 'S76-VCZ-01' AND deleted_at IS NULL;
-- S76-VMA-01 → S76-TRE-01Y
UPDATE manobras SET codigo = 'S76-TRE-01Y', updated_at = datetime('now') WHERE id = 970 AND codigo = '_TMP_970' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-TRE-01Y', updated_at = datetime('now') WHERE codigo = 'S76-VMA-01' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-TRE-01Y', updated_at = datetime('now') WHERE codigo_manobra = 'S76-VMA-01' AND deleted_at IS NULL;
-- LOFT-CHK-09 → A139-CHK-09
UPDATE manobras SET codigo = 'A139-CHK-09', updated_at = datetime('now') WHERE id = 744 AND codigo = '_TMP_744' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-09', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-09' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-09', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-09' AND deleted_at IS NULL;
-- LOFT-CHK-10 → A139-CHK-10
UPDATE manobras SET codigo = 'A139-CHK-10', updated_at = datetime('now') WHERE id = 745 AND codigo = '_TMP_745' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-CHK-10', updated_at = datetime('now') WHERE codigo = 'LOFT-CHK-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-CHK-10', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-CHK-10' AND deleted_at IS NULL;
-- LOFT-NOT-08 → A139-NOT-08
UPDATE manobras SET codigo = 'A139-NOT-08', updated_at = datetime('now') WHERE id = 787 AND codigo = '_TMP_787' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-08', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-08' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-08', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-08' AND deleted_at IS NULL;
-- LOFT-NOT-09 → A139-NOT-09
UPDATE manobras SET codigo = 'A139-NOT-09', updated_at = datetime('now') WHERE id = 788 AND codigo = '_TMP_788' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-09', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-09' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-09', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-09' AND deleted_at IS NULL;
-- LOFT-NOT-10 → A139-NOT-10
UPDATE manobras SET codigo = 'A139-NOT-10', updated_at = datetime('now') WHERE id = 789 AND codigo = '_TMP_789' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-10', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-10', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-10' AND deleted_at IS NULL;
-- LOFT-NOT-11 → A139-NOT-11
UPDATE manobras SET codigo = 'A139-NOT-11', updated_at = datetime('now') WHERE id = 790 AND codigo = '_TMP_790' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-NOT-11', updated_at = datetime('now') WHERE codigo = 'LOFT-NOT-11' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-NOT-11', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-NOT-11' AND deleted_at IS NULL;
-- LOFT-OFF-08 → A139-OFF-08
UPDATE manobras SET codigo = 'A139-OFF-08', updated_at = datetime('now') WHERE id = 765 AND codigo = '_TMP_765' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-08', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-08' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-08', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-08' AND deleted_at IS NULL;
-- LOFT-OFF-09 → A139-OFF-09
UPDATE manobras SET codigo = 'A139-OFF-09', updated_at = datetime('now') WHERE id = 766 AND codigo = '_TMP_766' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-09', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-09' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-09', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-09' AND deleted_at IS NULL;
-- LOFT-OFF-10 → A139-OFF-10
UPDATE manobras SET codigo = 'A139-OFF-10', updated_at = datetime('now') WHERE id = 767 AND codigo = '_TMP_767' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-OFF-10', updated_at = datetime('now') WHERE codigo = 'LOFT-OFF-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-OFF-10', updated_at = datetime('now') WHERE codigo_manobra = 'LOFT-OFF-10' AND deleted_at IS NULL;
-- S76-LOFT-09 → S76-LFT-09
UPDATE manobras SET codigo = 'S76-LFT-09', updated_at = datetime('now') WHERE id = 626 AND codigo = '_TMP_626' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-09', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-09' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-09', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-09' AND deleted_at IS NULL;
-- S76-LOFT-10 → S76-LFT-10
UPDATE manobras SET codigo = 'S76-LFT-10', updated_at = datetime('now') WHERE id = 627 AND codigo = '_TMP_627' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-10', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-10' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-10', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-10' AND deleted_at IS NULL;
-- S76-LOFT-11 → S76-LFT-11
UPDATE manobras SET codigo = 'S76-LFT-11', updated_at = datetime('now') WHERE id = 628 AND codigo = '_TMP_628' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-11', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-11' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-11', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-11' AND deleted_at IS NULL;
-- S76-LOFT-12 → S76-LFT-12
UPDATE manobras SET codigo = 'S76-LFT-12', updated_at = datetime('now') WHERE id = 629 AND codigo = '_TMP_629' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-LFT-12', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-12' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-LFT-12', updated_at = datetime('now') WHERE codigo_manobra = 'S76-LOFT-12' AND deleted_at IS NULL;
-- 76-APXAL → S76-VOO-01
UPDATE manobras SET codigo = 'S76-VOO-01', updated_at = datetime('now') WHERE id = 439 AND codigo = '_TMP_439' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-01', updated_at = datetime('now') WHERE codigo = '76-APXAL' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-01', updated_at = datetime('now') WHERE codigo_manobra = '76-APXAL' AND deleted_at IS NULL;
-- 76-APXPI → S76-VOO-02
UPDATE manobras SET codigo = 'S76-VOO-02', updated_at = datetime('now') WHERE id = 441 AND codigo = '_TMP_441' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-02', updated_at = datetime('now') WHERE codigo = '76-APXPI' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-02', updated_at = datetime('now') WHERE codigo_manobra = '76-APXPI' AND deleted_at IS NULL;
-- 76-ARRIF → S76-VOO-03
UPDATE manobras SET codigo = 'S76-VOO-03', updated_at = datetime('now') WHERE id = 440 AND codigo = '_TMP_440' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-03', updated_at = datetime('now') WHERE codigo = '76-ARRIF' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-03', updated_at = datetime('now') WHERE codigo_manobra = '76-ARRIF' AND deleted_at IS NULL;
-- 76-AUTAG → S76-VOO-04
UPDATE manobras SET codigo = 'S76-VOO-04', updated_at = datetime('now') WHERE id = 436 AND codigo = '_TMP_436' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-04', updated_at = datetime('now') WHERE codigo = '76-AUTAG' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-04', updated_at = datetime('now') WHERE codigo_manobra = '76-AUTAG' AND deleted_at IS NULL;
-- 76-POUAB → S76-VOO-05
UPDATE manobras SET codigo = 'S76-VOO-05', updated_at = datetime('now') WHERE id = 437 AND codigo = '_TMP_437' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-05', updated_at = datetime('now') WHERE codigo = '76-POUAB' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-05', updated_at = datetime('now') WHERE codigo_manobra = '76-POUAB' AND deleted_at IS NULL;
-- 76-POUMO → S76-VOO-06
UPDATE manobras SET codigo = 'S76-VOO-06', updated_at = datetime('now') WHERE id = 438 AND codigo = '_TMP_438' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'S76-VOO-06', updated_at = datetime('now') WHERE codigo = '76-POUMO' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'S76-VOO-06', updated_at = datetime('now') WHERE codigo_manobra = '76-POUMO' AND deleted_at IS NULL;
-- FLY-BAS-17 → A139-VOO-17
UPDATE manobras SET codigo = 'A139-VOO-17', updated_at = datetime('now') WHERE id = 368 AND codigo = '_TMP_368' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-VOO-17', updated_at = datetime('now') WHERE codigo = 'FLY-BAS-17' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-VOO-17', updated_at = datetime('now') WHERE codigo_manobra = 'FLY-BAS-17' AND deleted_at IS NULL;
-- FLY-BAS-X1 → A139-VOO-01
UPDATE manobras SET codigo = 'A139-VOO-01', updated_at = datetime('now') WHERE id = 364 AND codigo = '_TMP_364' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-VOO-01', updated_at = datetime('now') WHERE codigo = 'FLY-BAS-X1' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-VOO-01', updated_at = datetime('now') WHERE codigo_manobra = 'FLY-BAS-X1' AND deleted_at IS NULL;
-- FLY-BAS-X2 → A139-VOO-02
UPDATE manobras SET codigo = 'A139-VOO-02', updated_at = datetime('now') WHERE id = 365 AND codigo = '_TMP_365' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-VOO-02', updated_at = datetime('now') WHERE codigo = 'FLY-BAS-X2' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-VOO-02', updated_at = datetime('now') WHERE codigo_manobra = 'FLY-BAS-X2' AND deleted_at IS NULL;
-- FLY-BAS-X3 → A139-VOO-03
UPDATE manobras SET codigo = 'A139-VOO-03', updated_at = datetime('now') WHERE id = 366 AND codigo = '_TMP_366' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-VOO-03', updated_at = datetime('now') WHERE codigo = 'FLY-BAS-X3' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-VOO-03', updated_at = datetime('now') WHERE codigo_manobra = 'FLY-BAS-X3' AND deleted_at IS NULL;
-- FLY-BAS-X4 → A139-VOO-04
UPDATE manobras SET codigo = 'A139-VOO-04', updated_at = datetime('now') WHERE id = 367 AND codigo = '_TMP_367' AND empresa_id = 6 AND deleted_at IS NULL;
UPDATE fichas_sessao_manobras SET codigo = 'A139-VOO-04', updated_at = datetime('now') WHERE codigo = 'FLY-BAS-X4' AND deleted_at IS NULL;
UPDATE historico_notas_manobras SET codigo_manobra = 'A139-VOO-04', updated_at = datetime('now') WHERE codigo_manobra = 'FLY-BAS-X4' AND deleted_at IS NULL;

-- Validação:
-- SELECT COUNT(*) FROM manobras WHERE codigo LIKE '_TMP_%' AND deleted_at IS NULL; -- Esperado: 0
-- SELECT COUNT(*) FROM manobras WHERE codigo LIKE '76-%' AND deleted_at IS NULL; -- Esperado: 0
-- SELECT COUNT(*) FROM manobras WHERE deleted_at IS NULL; -- Esperado: 590
