package com.questlearn.repository;

import com.questlearn.model.Module;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ModuleRepository extends JpaRepository<Module, Long> {

    List<Module> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<Module> findByCourseIdInAndDueAtIsNotNull(Collection<Long> courseIds);

    List<Module> findByCourseIdIn(Collection<Long> courseIds);

    List<Module> findByParentModuleId(Long parentModuleId);

    List<Module> findByCourseIdAndParentModuleIsNullOrderByOrderIndexAsc(Long courseId);

    Optional<Module> findByIdAndCourseId(Long id, Long courseId);

    long countByCourseId(Long courseId);
}
